import { describe, expect, it } from 'vitest';
import { analyzeText, parseModelOutput } from '../../src/worker/ai';
import type { Env } from '../../src/worker/env';

describe('parseModelOutput', () => {
  const good = {
    items: [{ code: '５３３３', name: 'NGK', theme: '人事制度', headline: 'h', reaction: 'r', caveat: 'c', mark: 'strong' }],
    tasks: ['決算日を確認'],
  };
  it('オブジェクトを検証し、コードを正規化する', () => {
    const out = parseModelOutput(good)!;
    expect(out.items[0].code).toBe('5333');
    expect(out.items[0].mark).toBe('strong');
    expect(out.tasks).toEqual(['決算日を確認']);
  });
  it('前後に文章が付いた文字列から JSON を取り出す', () => {
    const out = parseModelOutput(`はい、結果です。\n${JSON.stringify(good)}\n以上`)!;
    expect(out.items).toHaveLength(1);
  });
  it('不正なコード・mark は無害化する', () => {
    const out = parseModelOutput({ items: [{ code: '12345', name: 'X', mark: 'buy!' }], tasks: [] })!;
    expect(out.items[0].code).toBe('');
    expect(out.items[0].mark).toBeNull();
  });
  it('長すぎる文字列は切り詰める', () => {
    const out = parseModelOutput({ items: [{ code: '', name: 'X', caveat: 'あ'.repeat(1000) }], tasks: [] })!;
    expect(out.items[0].caveat.length).toBe(240);
  });
  it('壊れた出力は null', () => {
    expect(parseModelOutput('JSONではありません')).toBeNull();
    expect(parseModelOutput('{"items": [}')).toBeNull();
  });
});

describe('analyzeText', () => {
  it('Workers AI に JSON スキーマ付きで依頼し、結果を検証する', async () => {
    const calls: unknown[] = [];
    const env = {
      AI: {
        run: async (_model: string, input: unknown) => {
          calls.push(input);
          return { response: { items: [{ code: '5333', name: 'NGK', theme: '人事', headline: 'h', reaction: 'r', caveat: 'c', mark: 'none' }], tasks: [] } };
        },
      },
    } as unknown as Env;
    const a = await analyzeText(env, 'NGK(5333)が一時金');
    expect(a.items[0]).toMatchObject({ code: '5333', name: 'NGK', mark: null });
    expect((calls[0] as { response_format: { type: string } }).response_format.type).toBe('json_schema');
  });
  it('JSON Mode が失敗したらスキーマなしで再試行する', async () => {
    let n = 0;
    const env = {
      AI: {
        run: async () => {
          n++;
          if (n === 1) throw new Error("JSON Mode couldn't be met");
          return { response: '```json\n{"items":[{"code":"6098","name":"リクルート","mark":"weak"}],"tasks":["確認"]}\n```' };
        },
      },
    } as unknown as Env;
    const a = await analyzeText(env, 'リクルート(6098)が安い');
    expect(n).toBe(2);
    expect(a.items[0]).toMatchObject({ code: '6098', mark: 'weak' });
  });
});
