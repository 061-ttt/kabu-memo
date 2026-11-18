import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { extractCodes, isStockCode } from '../shared/codes';
import { isDay, todayJst } from '../shared/day';
import type { Analysis, Memo, Metrics, Pick, Range, Task } from '../shared/types';
import { RANGES } from '../shared/types';
import { analyzeText, consumeQuota } from './ai';
import type { AppEnv } from './env';
import { getMarket } from './market';

const ID = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const Day = z.string().refine(isDay, 'invalid day');
const Code = z.string().refine(isStockCode, 'invalid code');
const Time = z.number().int().nonnegative();

/** 未来すぎる更新時刻で他端末の更新を永久に負かすのを防ぐ */
const clampTime = (t: number) => Math.min(t, Date.now() + 60_000);

const MemoBody = z.object({
  day: Day,
  body: z.string().min(1).max(10_000),
  createdAt: Time,
  updatedAt: Time,
  deletedAt: Time.nullable().default(null),
});

const TaskBody = z.object({
  title: z.string().trim().min(1).max(200),
  status: z.enum(['todo', 'doing', 'done']),
  code: Code.nullable().default(null),
  createdAt: Time,
  updatedAt: Time,
  deletedAt: Time.nullable().default(null),
});

const num = z.number().finite().nullable().optional();
const PickBody = z.object({
  day: Day,
  code: Code,
  name: z.string().max(60).default(''),
  theme: z.string().max(30).default(''),
  headline: z.string().max(200).default(''),
  reaction: z.string().max(1000).default(''),
  caveat: z.string().max(1000).default(''),
  mark: z.enum(['strong', 'weak']).nullable().default(null),
  metrics: z.object({ per: num, perForecast: num, pbr: num, roe: num, marketCap: num }).default({}),
  createdAt: Time,
  updatedAt: Time,
  deletedAt: Time.nullable().default(null),
});

type Row = Record<string, unknown>;

const toMemo = (r: Row): Memo => ({
  id: r.id as string,
  day: r.day as string,
  body: r.body as string,
  codes: JSON.parse((r.codes as string) || '[]'),
  analysis: r.analysis ? (JSON.parse(r.analysis as string) as Analysis) : null,
  createdAt: r.created_at as number,
  updatedAt: r.updated_at as number,
  deletedAt: (r.deleted_at as number | null) ?? null,
});

const toTask = (r: Row): Task => ({
  id: r.id as string,
  title: r.title as string,
  status: r.status as Task['status'],
  code: (r.code as string | null) ?? null,
  createdAt: r.created_at as number,
  updatedAt: r.updated_at as number,
  deletedAt: (r.deleted_at as number | null) ?? null,
});

const toPick = (r: Row): Pick => ({
  id: r.id as string,
  day: r.day as string,
  code: r.code as string,
  name: r.name as string,
  theme: r.theme as string,
  headline: r.headline as string,
  reaction: r.reaction as string,
  caveat: r.caveat as string,
  mark: (r.mark as Pick['mark']) ?? null,
  metrics: JSON.parse((r.metrics as string) || '{}') as Metrics,
  createdAt: r.created_at as number,
  updatedAt: r.updated_at as number,
  deletedAt: (r.deleted_at as number | null) ?? null,
});

export const api = new Hono<AppEnv>();

api.get('/me', (c) => c.json({ user: c.get('user') }));

// ---- メモ ----
api.get('/memos', async (c) => {
  const user = c.get('user');
  const day = c.req.query('day');
  const code = c.req.query('code');
  if (code) {
    if (!isStockCode(code)) return c.json({ error: 'invalid code' }, 400);
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM memos WHERE user_id = ? AND deleted_at IS NULL AND codes LIKE ? ORDER BY created_at DESC LIMIT 30`,
    )
      .bind(user.id, `%"${code}"%`)
      .all();
    return c.json({ memos: results.map(toMemo) });
  }
  if (!day || !isDay(day)) return c.json({ error: 'invalid day' }, 400);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM memos WHERE user_id = ? AND day = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 500`,
  )
    .bind(user.id, day)
    .all();
  return c.json({ memos: results.map(toMemo) });
});

api.put('/memos/:id', async (c) => {
  const user = c.get('user');
  const id = ID.safeParse(c.req.param('id'));
  const body = MemoBody.safeParse(await c.req.json().catch(() => null));
  if (!id.success || !body.success) return c.json({ error: 'invalid' }, 400);
  const m = body.data;
  const res = await c.env.DB.prepare(
    `INSERT INTO memos (id, user_id, day, body, codes, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET day = excluded.day, body = excluded.body, codes = excluded.codes,
       updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
     WHERE memos.user_id = excluded.user_id AND excluded.updated_at >= memos.updated_at`,
  )
    .bind(id.data, user.id, m.day, m.body, JSON.stringify(extractCodes(m.body)), m.createdAt, clampTime(m.updatedAt), m.deletedAt)
    .run();
  return respondUpsert(c, 'memos', id.data, res.meta.changes, toMemo);
});

// ---- タスク ----
api.get('/tasks', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM tasks WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 500`,
  )
    .bind(c.get('user').id)
    .all();
  return c.json({ tasks: results.map(toTask) });
});

api.put('/tasks/:id', async (c) => {
  const user = c.get('user');
  const id = ID.safeParse(c.req.param('id'));
  const body = TaskBody.safeParse(await c.req.json().catch(() => null));
  if (!id.success || !body.success) return c.json({ error: 'invalid' }, 400);
  const t = body.data;
  const res = await c.env.DB.prepare(
    `INSERT INTO tasks (id, user_id, title, status, code, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, status = excluded.status, code = excluded.code,
       updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
     WHERE tasks.user_id = excluded.user_id AND excluded.updated_at >= tasks.updated_at`,
  )
    .bind(id.data, user.id, t.title, t.status, t.code, t.createdAt, clampTime(t.updatedAt), t.deletedAt)
    .run();
  return respondUpsert(c, 'tasks', id.data, res.meta.changes, toTask);
});

// ---- 銘柄ノート ----
api.get('/picks', async (c) => {
  const day = c.req.query('day');
  if (!day || !isDay(day)) return c.json({ error: 'invalid day' }, 400);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM picks WHERE user_id = ? AND day = ? AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 500`,
  )
    .bind(c.get('user').id, day)
    .all();
  return c.json({ picks: results.map(toPick) });
});

api.put('/picks/:id', async (c) => {
  const user = c.get('user');
  const id = ID.safeParse(c.req.param('id'));
  const body = PickBody.safeParse(await c.req.json().catch(() => null));
  if (!id.success || !body.success) return c.json({ error: 'invalid' }, 400);
  const p = body.data;
  const res = await c.env.DB.prepare(
    `INSERT INTO picks (id, user_id, day, code, name, theme, headline, reaction, caveat, mark, metrics, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET day = excluded.day, code = excluded.code, name = excluded.name, theme = excluded.theme,
       headline = excluded.headline, reaction = excluded.reaction, caveat = excluded.caveat, mark = excluded.mark,
       metrics = excluded.metrics, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
     WHERE picks.user_id = excluded.user_id AND excluded.updated_at >= picks.updated_at`,
  )
    .bind(
      id.data, user.id, p.day, p.code, p.name, p.theme, p.headline, p.reaction, p.caveat, p.mark,
      JSON.stringify(p.metrics), p.createdAt, clampTime(p.updatedAt), p.deletedAt,
    )
    .run();
  return respondUpsert(c, 'picks', id.data, res.meta.changes, toPick);
});

async function respondUpsert<T>(
  c: Context<AppEnv>,
  table: 'memos' | 'tasks' | 'picks',
  id: string,
  changes: number,
  map: (r: Row) => T,
) {
  const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`).bind(id, c.get('user').id).first<Row>();
  // 他ユーザーの同一IDは上書きしない
  if (!row) return c.json({ error: 'conflict' }, 409);
  return c.json({ item: map(row), applied: changes > 0 });
}

// ---- AI ----
api.post('/ai/memo/:id', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare('SELECT * FROM memos WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
    .bind(c.req.param('id'), user.id)
    .first<Row>();
  if (!row) return c.json({ error: 'not found' }, 404);
  if (!(await consumeQuota(c.env, user.id, todayJst()))) return c.json({ error: 'quota' }, 429);
  let analysis: Analysis;
  try {
    analysis = await analyzeText(c.env, row.body as string);
  } catch {
    return c.json({ error: 'ai' }, 502);
  }
  await c.env.DB.prepare('UPDATE memos SET analysis = ? WHERE id = ? AND user_id = ?')
    .bind(JSON.stringify(analysis), row.id, user.id)
    .run();
  return c.json({ analysis });
});

api.post('/ai/pick/:id', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare('SELECT * FROM picks WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
    .bind(c.req.param('id'), user.id)
    .first<Row>();
  if (!row) return c.json({ error: 'not found' }, 404);
  if (!(await consumeQuota(c.env, user.id, todayJst()))) return c.json({ error: 'quota' }, 429);
  const pick = toPick(row);
  const { results } = await c.env.DB.prepare(
    `SELECT body FROM memos WHERE user_id = ? AND deleted_at IS NULL AND codes LIKE ? ORDER BY created_at DESC LIMIT 5`,
  )
    .bind(user.id, `%"${pick.code}"%`)
    .all<{ body: string }>();
  const text = [`${pick.name}（${pick.code}）${pick.headline}`, pick.reaction, ...results.map((r) => r.body)].filter(Boolean).join('\n');
  let item;
  try {
    const a = await analyzeText(c.env, text);
    item = a.items.find((i) => i.code === pick.code) ?? a.items[0];
  } catch {
    return c.json({ error: 'ai' }, 502);
  }
  if (!item) return c.json({ error: 'ai' }, 502);
  const now = Date.now();
  const next: Pick = {
    ...pick,
    name: pick.name || item.name,
    theme: item.theme || pick.theme,
    headline: pick.headline || item.headline,
    reaction: item.reaction || pick.reaction,
    caveat: item.caveat || pick.caveat,
    mark: pick.mark ?? item.mark,
    updatedAt: now,
  };
  await c.env.DB.prepare(
    'UPDATE picks SET name = ?, theme = ?, headline = ?, reaction = ?, caveat = ?, mark = ?, updated_at = ? WHERE id = ? AND user_id = ?',
  )
    .bind(next.name, next.theme, next.headline, next.reaction, next.caveat, next.mark, now, pick.id, user.id)
    .run();
  return c.json({ item: next });
});

// ---- 株価 ----
api.get('/market/:code', async (c) => {
  const code = c.req.param('code');
  const range = (c.req.query('range') ?? '3mo') as Range;
  if (!isStockCode(code) || !RANGES.includes(range)) return c.json({ error: 'invalid' }, 400);
  try {
    const market = await getMarket(c.env, code, range, c.executionCtx as ExecutionContext);
    if (!market) return c.json({ error: 'unavailable' }, 502);
    return c.json({ market }, 200, { 'cache-control': 'private, max-age=120' });
  } catch {
    return c.json({ error: 'unavailable' }, 502);
  }
});
