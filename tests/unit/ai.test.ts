import { describe, expect, it } from 'vitest';
import { DraftSchema, ReadSchema, draftEntry, extractJson, readScreen, textOf } from '../../src/worker/ai';
import type { Env } from '../../src/worker/env';

describe('extractJson', () => {
  it('オブジェクトはそのまま返す', () => {
    expect(extractJson({ a: 1 })).toEqual({ a: 1 });
  });
  it('前後に文章や考え中のタグが付いた文字列から最後の JSON を取り出す', () => {
    const raw = '<think>まず {仮} を考える</think>結果です。\n```json\n{"theme":"上方修正","mark":"strong"}\n```\n以上';
    expect(extractJson(raw)).toEqual({ theme: '上方修正', mark: 'strong' });
  });
  it('壊れた出力は null', () => {
    expect(extractJson('JSONではありません')).toBeNull();
    expect(extractJson('{"a": [}')).toBeNull();
  });
});

describe('textOf', () => {
  it('response 形式と choices 形式の両方から本文を取り出す', () => {
    expect(textOf({ response: 'x' })).toBe('x');
    expect(textOf({ choices: [{ message: { content: 'y' } }] })).toBe('y');
  });
});

describe('DraftSchema / ReadSchema', () => {
  it('mark は strong / weak 以外を空にし、長すぎる文字列は切り詰める', () => {
    const d = DraftSchema.parse({ theme: 'あ'.repeat(40), takeaway: '※', caveat: 'c', mark: 'buy!', material: '' });
    expect(d.mark).toBe('');
    expect(d.theme.length).toBe(16);
  });
  it('コードは全角を半角にし、不正なら空にする', () => {
    expect(ReadSchema.parse({ code: '５８０１', name: '古河電' }).code).toBe('5801');
    expect(ReadSchema.parse({ code: '12345' }).code).toBe('');
    expect(ReadSchema.parse({ code: 5333 }).code).toBe('5333');
  });
});

describe('draftEntry', () => {
  it('Workers AI に JSON スキーマ付きで依頼し、結果を検証する', async () => {
    const calls: Array<{ response_format?: { type: string }; messages: Array<{ content: string }> }> = [];
    const env = {
      AI: {
        run: async (_m: string, input: never) => {
          calls.push(input);
          return { response: { theme: '特許訴訟', takeaway: '※請求額は示されず', caveat: '影響は不明。', mark: 'none', material: '' } };
        },
      },
    } as unknown as Env;
    const d = await draftEntry(env, { code: '5801', name: '古河電', headline: '半導体材料で提訴、1.04%高', material: '' });
    expect(d).toMatchObject({ theme: '特許訴訟', mark: '' });
    expect(calls[0].response_format?.type).toBe('json_schema');
    expect(calls[0].messages[1].content).toContain('古河電（5801）');
  });
  it('JSON Mode が失敗したらスキーマなしで再試行する', async () => {
    let n = 0;
    const env = {
      AI: {
        run: async () => {
          n++;
          if (n === 1) throw new Error("JSON Mode couldn't be met");
          return { response: '```json\n{"theme":"上方修正","takeaway":"※過熱感","caveat":"c","mark":"strong","material":""}\n```' };
        },
      },
    } as unknown as Env;
    expect((await draftEntry(env, { code: '', name: 'Rebase', headline: 'ストップ高', material: '' })).mark).toBe('strong');
    expect(n).toBe(2);
  });
});

describe('readScreen', () => {
  it('画像を image_url として渡し、読み取り結果を検証する', async () => {
    let sent: unknown = null;
    const env = {
      AI: {
        run: async (_m: string, input: unknown) => {
          sent = input;
          return { choices: [{ message: { content: '{"code":"5138","name":"Rebase","headline":"上方修正","material":""}' } }] };
        },
      },
    } as unknown as Env;
    const r = await readScreen(env, 'data:image/jpeg;base64,AAAA');
    expect(r.code).toBe('5138');
    const content = (sent as { messages: Array<{ content: Array<{ type: string }> }> }).messages[0].content;
    expect(content.map((c) => c.type)).toEqual(['text', 'image_url']);
  });
});
