import { z } from 'zod';
import { extractCodes, isStockCode, toHalfWidth } from '../shared/codes';
import type { Analysis, AnalysisItem } from '../shared/types';
import type { Env } from './env';

export const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const SYSTEM = `あなたは日本株の個人投資家の記録を整理する補助役です。
入力は投資家が書いたメモです。メモに書かれた内容だけを根拠に、言及された銘柄ごとに整理してください。
- code: 本文に4桁の銘柄コードがあればそれ。なければ空文字。推測でコードを作らない。
- name: 銘柄名（本文の表記を優先）。
- theme: 材料の種類を短く（例: 決算、上方修正、目標株価引き上げ、人事制度、需給、アクティビスト）。12文字以内。
- headline: 何が起きたかを1文、40文字以内。
- reaction: 「材料と反応」。材料の中身と株価の反応を1〜2文。数値は本文にあるものだけ使う。
- caveat: 「素直に受け取れない点」。業績に効く材料か、一過性か、地合い・需給・セクター連動の影響はないか等を1〜2文。
- mark: 本文から強い動きなら "strong"、弱い動きなら "weak"、判断できなければ "none"。
tasks: このメモの後に投資家が確認すべき具体的な行動を最大3件。各30文字以内。
売買の推奨や断定はしないこと。日本語で書くこと。`;

const JSON_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          name: { type: 'string' },
          theme: { type: 'string' },
          headline: { type: 'string' },
          reaction: { type: 'string' },
          caveat: { type: 'string' },
          mark: { type: 'string', enum: ['strong', 'weak', 'none'] },
        },
        required: ['code', 'name', 'theme', 'headline', 'reaction', 'caveat', 'mark'],
      },
    },
    tasks: { type: 'array', items: { type: 'string' } },
  },
  required: ['items', 'tasks'],
};

const clip = (n: number) => z.string().transform((s) => s.trim().slice(0, n));

const ItemSchema = z.object({
  code: z
    .string()
    .optional()
    .default('')
    .transform((s) => toHalfWidth(s.trim().toUpperCase()))
    .transform((s) => (isStockCode(s) ? s : '')),
  name: clip(40).optional().default(''),
  theme: clip(16).optional().default(''),
  headline: clip(80).optional().default(''),
  reaction: clip(240).optional().default(''),
  caveat: clip(240).optional().default(''),
  mark: z
    .string()
    .optional()
    .transform((m) => (m === 'strong' || m === 'weak' ? m : null)),
});

export const AnalysisSchema = z.object({
  items: z.array(ItemSchema).max(8).default([]),
  tasks: z.array(clip(60)).max(5).default([]),
});

/** モデル出力（オブジェクトまたは文字列）から JSON を取り出して検証する */
export function parseModelOutput(raw: unknown): { items: AnalysisItem[]; tasks: string[] } | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      value = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  const parsed = AnalysisSchema.safeParse(value);
  if (!parsed.success) return null;
  const items = parsed.data.items.filter((i) => i.name || i.code) as AnalysisItem[];
  const tasks = parsed.data.tasks.filter(Boolean);
  return { items, tasks };
}

/** テスト用の決定的な応答。本番では AI_MODE を設定しない */
function mockAnalyze(text: string): { items: AnalysisItem[]; tasks: string[] } {
  const codes = extractCodes(text);
  const strong = /高|上げ|急騰|ストップ高|上方/.test(text);
  const weak = /安|下げ|急落|ストップ安|下方/.test(text);
  const mark = strong && !weak ? 'strong' : weak && !strong ? 'weak' : null;
  const name = text.match(/^([^\s、。,]{1,12})(が|は|、)/)?.[1] ?? '';
  const targets = codes.length ? codes : [''];
  return {
    items: targets.map((code, i) => ({
      code,
      name: i === 0 ? name || `銘柄${code}` : `銘柄${code}`,
      theme: /決算|修正/.test(text) ? '業績' : '材料',
      headline: text.slice(0, 40),
      reaction: `材料: ${text.slice(0, 30)}。反応は${mark === 'strong' ? '上昇' : mark === 'weak' ? '下落' : '限定的'}。`,
      caveat: '業績への直接の影響は限定的な可能性。地合いとの連動も確認が必要。',
      mark,
    })),
    tasks: [`${codes[0] ?? '銘柄'}の決算日を確認`, '翌日の寄り付きの気配を確認'],
  };
}

export async function analyzeText(env: Env, text: string): Promise<Analysis> {
  const model = env.AI_MODEL || DEFAULT_MODEL;
  const hints = extractCodes(text);
  if (env.AI_MODE === 'mock') {
    return { ...mockAnalyze(text), model: 'mock', at: Date.now() };
  }
  if (!env.AI) throw new Error('AI binding missing');
  const messages = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `メモ:\n${text.slice(0, 4000)}\n\n本文中の銘柄コード候補: ${hints.join(', ') || 'なし'}\nJSONで答えてください。`,
    },
  ];
  const run = (withSchema: boolean) =>
    env.AI!.run(model as keyof AiModels, {
      messages,
      max_tokens: 1400,
      temperature: 0.2,
      ...(withSchema ? { response_format: { type: 'json_schema', json_schema: JSON_SCHEMA } } : {}),
    } as never) as Promise<{ response?: unknown }>;

  let out: { items: AnalysisItem[]; tasks: string[] } | null = null;
  try {
    out = parseModelOutput((await run(true)).response);
  } catch {
    out = null;
  }
  // JSON Mode が満たせなかった場合はスキーマなしで再試行し、本文から JSON を抜き出す
  if (!out) out = parseModelOutput((await run(false)).response);
  if (!out) throw new Error('AI output invalid');
  return { ...out, model, at: Date.now() };
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
