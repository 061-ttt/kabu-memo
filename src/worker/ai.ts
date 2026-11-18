// Workers AI：見出しからの下書きと、スクリーンショットの読み取り
import { z } from 'zod';
import { isStockCode, toHalfWidth } from '../shared/codes';
import type { Draft, ScreenRead } from '../shared/types';
import type { Env } from './env';

export const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const DEFAULT_VISION_MODEL = '@cf/google/gemma-4-26b-a4b-it';

const clip = (n: number) => z.string().optional().default('').transform((s) => s.trim().slice(0, n));
const codeField = z
  .union([z.string(), z.number()])
  .optional()
  .default('')
  .transform((s) => toHalfWidth(String(s).trim().toUpperCase()))
  .transform((s) => (isStockCode(s) ? s : ''));

export const DraftSchema = z.object({
  theme: clip(16),
  takeaway: clip(40),
  caveat: clip(300),
  material: clip(300),
  mark: z
    .string()
    .optional()
    .transform((m) => (m === 'strong' || m === 'weak' ? m : '')),
});

export const ReadSchema = z.object({
  code: codeField,
  name: clip(40),
  headline: clip(120),
  material: clip(400),
});

/** モデル出力（オブジェクトまたは文字列）から最後の JSON オブジェクトを取り出す */
export function extractJson(raw: unknown): unknown {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
  const end = text.lastIndexOf('}');
  if (end < 0) return null;
  // 後ろから対応する { を探す（考え中の文章に { が混ざっても最後の塊を採る）
  let start = text.lastIndexOf('{', end);
  while (start >= 0) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      /* もっと前から試す */
    }
    if (start === 0) break;
    start = text.lastIndexOf('{', start - 1);
  }
  return null;
}

/** Workers AI の応答形式の違い（response / choices）を吸収して本文を取り出す */
export function textOf(out: unknown): unknown {
  if (!out || typeof out !== 'object') return out;
  const o = out as { response?: unknown; choices?: Array<{ message?: { content?: unknown } }> };
  if (o.response !== undefined) return o.response;
  return o.choices?.[0]?.message?.content ?? null;
}

const DRAFT_SYSTEM = `あなたは日本株の個別材料を冷静に整理するアナリストです。
渡された銘柄メモだけを根拠に、JSONで答えます。書かれていない事実は足さず、分からないことは分からないと書きます。売買の推奨はしません。
- theme: 材料の種類を8文字以内（例: 上方修正, 情報流出, 目標株価上げ, 事業売却, アクティビスト, 人事制度）
- takeaway: 「※」で始まる20文字以内の一言（例: ※業績材料ではない）
- caveat: この材料を素直に受け取れない点を1〜2文（業績に効くか、一過性か、需給・地合い・過熱感など）
- mark: 材料の強さと株価の反応がはっきり同じ向きなら "strong" か "weak"、そうでなければ "none"
- material: 「材料と反応」が未記入のときだけ、見出しから1〜2文で整理。記入済みなら空文字`;

const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    theme: { type: 'string' },
    takeaway: { type: 'string' },
    caveat: { type: 'string' },
    mark: { type: 'string', enum: ['strong', 'weak', 'none'] },
    material: { type: 'string' },
  },
  required: ['theme', 'takeaway', 'caveat', 'mark', 'material'],
};

export interface DraftInput {
  code: string;
  name: string;
  headline: string;
  material: string;
  close?: number | null;
  changePct?: number | null;
}

export async function draftEntry(env: Env, input: DraftInput): Promise<Draft> {
  if (env.AI_MODE === 'mock') {
    const up = /高|上げ|上方|ストップ高/.test(input.headline);
    const down = /安|下げ|下方|流出|ストップ安/.test(input.headline);
    return {
      theme: /修正/.test(input.headline) ? '業績修正' : '材料',
      takeaway: '※模擬の下書き',
      caveat: '模擬AIの下書きです。業績への影響は未確認。',
      mark: up && !down ? 'strong' : down && !up ? 'weak' : '',
      material: input.material ? '' : `${input.headline}と伝わった。`,
    };
  }
  if (!env.AI) throw new Error('AI binding missing');
  const model = env.AI_MODEL || DEFAULT_MODEL;
  const user = [
    `銘柄: ${input.name || '不明'}（${input.code || '—'}）`,
    `見出し: ${input.headline || '（なし）'}`,
    `材料と反応: ${input.material || '（未記入）'}`,
    `株価: 終値 ${input.close ?? '不明'} / 前日比 ${input.changePct != null ? `${input.changePct}%` : '不明'}`,
  ].join('\n');
  const messages = [
    { role: 'system', content: DRAFT_SYSTEM },
    { role: 'user', content: `${user}\nJSONで答えてください。` },
  ];
  const run = (withSchema: boolean) =>
    env.AI!.run(model as keyof AiModels, {
      messages,
      max_tokens: 700,
      temperature: 0.2,
      ...(withSchema ? { response_format: { type: 'json_schema', json_schema: DRAFT_SCHEMA } } : {}),
    } as never);
  let parsed = DraftSchema.safeParse(extractJson(textOf(await run(true).catch(() => null))));
  // JSON Mode が満たせなかった場合はスキーマなしで再試行し、本文から JSON を抜き出す
  if (!parsed.success) parsed = DraftSchema.safeParse(extractJson(textOf(await run(false))));
  if (!parsed.success) throw new Error('AI output invalid');
  return parsed.data as Draft;
}

const READ_PROMPT = `この画像は日本株の株価画面かニュース画面のスクリーンショットです。画像に写っている内容だけを使い、次のJSONだけを返してください。読み取れない項目は空文字にし、推測で埋めないでください。
{"code":"証券コード（4桁。英字を含むこともある）","name":"銘柄名（短い通称）","headline":"ニュースの見出し","material":"ニュース本文の要点を1〜2文"}`;

export async function readScreen(env: Env, dataUrl: string): Promise<ScreenRead> {
  if (env.AI_MODE === 'mock') return { code: '5801', name: '古河電', headline: '模擬の読み取り結果', material: '' };
  if (!env.AI) throw new Error('AI binding missing');
  const model = env.AI_VISION_MODEL || DEFAULT_VISION_MODEL;
  const out = await env.AI.run(model as keyof AiModels, {
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: READ_PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    max_tokens: 1200,
    temperature: 0.1,
  } as never);
  const parsed = ReadSchema.safeParse(extractJson(textOf(out)));
  if (!parsed.success) throw new Error('AI output invalid');
  return parsed.data;
}

export async function consumeQuota(env: Env, userId: string, day: string): Promise<boolean> {
  const limit = Number(env.AI_DAILY_LIMIT || 60);
  const row = await env.DB.prepare(
    `INSERT INTO ai_usage (user_id, day, count) VALUES (?, ?, 1)
     ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1
     RETURNING count`,
  )
    .bind(userId, day)
    .first<{ count: number }>();
  return (row?.count ?? 0) <= limit;
}
