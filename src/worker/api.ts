import { Hono } from 'hono';
import { z } from 'zod';
import { isStockCode } from '../shared/codes';
import { isDay, todayJst } from '../shared/day';
import type { Entry, Note } from '../shared/types';
import { consumeQuota, draftEntry, readScreen } from './ai';
import { nowOf, type AppEnv } from './env';
import { getQuote } from './quote';

const ID = z.string().regex(/^[A-Za-z0-9_-]{6,64}$/);
const Day = z.string().refine(isDay, 'invalid day');
const Time = z.number().int().nonnegative();

/** 未来すぎる更新時刻で他端末の更新を永久に負かすのを防ぐ */
const clampTime = (t: number, now: number) => Math.min(t, now + 60_000);

const s = (n: number) => z.string().max(n).default('');
const priceNum = z.union([z.number().finite(), z.literal('')]).default('');

const EntryData = z.object({
  code: z
    .string()
    .max(8)
    .default('')
    .refine((c) => c === '' || isStockCode(c), 'invalid code'),
  name: s(60),
  mark: z.enum(['strong', 'weak', '']).default(''),
  theme: s(40),
  headline: s(300),
  takeaway: s(120),
  material: s(2000),
  caveat: s(2000),
  srcLabel: s(40),
  srcUrl: z
    .string()
    .max(600)
    .default('')
    .refine((u) => u === '' || /^https?:\/\//i.test(u), 'invalid url'),
  close: priceNum,
  change: priceNum,
  changePct: priceNum,
  perA: s(20),
  perF: s(20),
  pbr: s(20),
  roe: s(20),
  mcap: s(30),
  volume: s(30),
  ohlc: s(30_000),
  order: z.number().int().min(0).max(1e9).default(0),
  sample: z.boolean().default(false),
});

const EntryBody = z.object({
  day: Day,
  data: EntryData,
  createdAt: Time,
  updatedAt: Time,
  deletedAt: Time.nullable().default(null),
});

const NoteData = z.object({
  general: s(20_000),
  us: s(20_000),
  jp: s(20_000),
  indices: z.array(z.object({ name: s(30), value: s(30), chg: s(40) })).max(20).default([]),
  sample: z.boolean().default(false),
});

const NoteBody = z.object({ data: NoteData, updatedAt: Time });

type Row = Record<string, unknown>;

const toEntry = (r: Row): Entry => ({
  id: r.id as string,
  day: r.day as string,
  data: JSON.parse(r.data as string),
  createdAt: r.created_at as number,
  updatedAt: r.updated_at as number,
  deletedAt: (r.deleted_at as number | null) ?? null,
});

const toNote = (r: Row): Note => ({ day: r.day as string, data: JSON.parse(r.data as string), updatedAt: r.updated_at as number });

export const api = new Hono<AppEnv>();

api.get('/me', (c) => c.json({ user: c.get('user') }));

// ---- 差分同期：サーバー時刻 since より後に変わった行（削除を含む） ----
api.get('/sync', async (c) => {
  const user = c.get('user');
  const since = Number(c.req.query('since') ?? 0);
  if (!Number.isFinite(since) || since < 0) return c.json({ error: 'invalid since' }, 400);
  const now = nowOf(c.env);
  const [entries, notes] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT * FROM entries WHERE user_id = ? AND server_at > ? ORDER BY server_at LIMIT 5000').bind(user.id, since),
    c.env.DB.prepare('SELECT * FROM day_notes WHERE user_id = ? AND server_at > ? ORDER BY server_at LIMIT 2000').bind(user.id, since),
  ]);
  return c.json({ entries: (entries.results as Row[]).map(toEntry), notes: (notes.results as Row[]).map(toNote), now });
});

api.put('/entries/:id', async (c) => {
  const user = c.get('user');
  const id = ID.safeParse(c.req.param('id'));
  const body = EntryBody.safeParse(await c.req.json().catch(() => null));
  if (!id.success || !body.success) return c.json({ error: 'invalid' }, 400);
  const e = body.data;
  const now = nowOf(c.env);
  const res = await c.env.DB.prepare(
    `INSERT INTO entries (id, user_id, day, data, created_at, updated_at, deleted_at, server_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET day = excluded.day, data = excluded.data, updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at, server_at = excluded.server_at
     WHERE entries.user_id = excluded.user_id AND excluded.updated_at >= entries.updated_at`,
  )
    .bind(id.data, user.id, e.day, JSON.stringify(e.data), e.createdAt, clampTime(e.updatedAt, now), e.deletedAt, now)
    .run();
  const row = await c.env.DB.prepare('SELECT * FROM entries WHERE id = ? AND user_id = ?').bind(id.data, user.id).first<Row>();
  // 他ユーザーの同一IDは上書きしない
  if (!row) return c.json({ error: 'conflict' }, 409);
  return c.json({ item: toEntry(row), applied: res.meta.changes > 0 });
});

api.put('/notes/:day', async (c) => {
  const user = c.get('user');
  const day = Day.safeParse(c.req.param('day'));
  const body = NoteBody.safeParse(await c.req.json().catch(() => null));
  if (!day.success || !body.success) return c.json({ error: 'invalid' }, 400);
  const now = nowOf(c.env);
  const res = await c.env.DB.prepare(
    `INSERT INTO day_notes (user_id, day, data, updated_at, server_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, day) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, server_at = excluded.server_at
     WHERE excluded.updated_at >= day_notes.updated_at`,
  )
    .bind(user.id, day.data, JSON.stringify(body.data.data), clampTime(body.data.updatedAt, now), now)
    .run();
  const row = await c.env.DB.prepare('SELECT * FROM day_notes WHERE user_id = ? AND day = ?').bind(user.id, day.data).first<Row>();
  return c.json({ item: row ? toNote(row) : null, applied: res.meta.changes > 0 });
});

// ---- 株価・指標 ----
api.get('/quote/:code', async (c) => {
  const code = c.req.param('code').toUpperCase();
  const day = c.req.query('day') ?? todayJst(nowOf(c.env));
  if (!isStockCode(code) || !isDay(day)) return c.json({ error: 'invalid' }, 400);
  try {
    const quote = await getQuote(c.env, code, day, c.executionCtx as ExecutionContext);
    return c.json({ quote }, 200, { 'cache-control': 'private, max-age=60' });
  } catch (e) {
    console.error(e);
    return c.json({ error: 'unavailable' }, 502);
  }
});

// ---- AI ----
const DraftBody = z.object({
  code: z.string().max(8).default(''),
  name: s(60),
  headline: s(300),
  material: s(2000),
  close: z.number().finite().nullable().optional(),
  changePct: z.number().finite().nullable().optional(),
});

api.post('/ai/draft', async (c) => {
  const user = c.get('user');
  const body = DraftBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success || (!body.data.headline && !body.data.material)) return c.json({ error: 'invalid' }, 400);
  if (!(await consumeQuota(c.env, user.id, todayJst(nowOf(c.env))))) return c.json({ error: 'quota' }, 429);
  try {
    return c.json({ draft: await draftEntry(c.env, body.data) });
  } catch (e) {
    console.error(e);
    return c.json({ error: 'ai' }, 502);
  }
});

const ReadBody = z.object({
  image: z
    .string()
    .max(4_000_000)
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
});

api.post('/ai/read', async (c) => {
  const user = c.get('user');
  const body = ReadBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'invalid' }, 400);
  if (!(await consumeQuota(c.env, user.id, todayJst(nowOf(c.env))))) return c.json({ error: 'quota' }, 429);
  try {
    return c.json({ read: await readScreen(c.env, body.data.image) });
  } catch (e) {
    console.error(e);
    return c.json({ error: 'ai' }, 502);
  }
});
