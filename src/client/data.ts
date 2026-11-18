import { extractCodes } from '../shared/codes';
import type { Analysis, AnalysisItem, Market, Memo, Pick, Range, Task, TaskStatus, User } from '../shared/types';
import { getState, type Kind, persistNow, resetLocalData, setState, toast } from './store';

// ---------------- HTTP ----------------
export class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new HttpError(res.status);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

// ---------------- 送信キュー ----------------
const OUTBOX = 'km:outbox';
let outbox: string[] = (() => {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX) || '[]');
  } catch {
    return [];
  }
})();
const saveOutbox = () => localStorage.setItem(OUTBOX, JSON.stringify(outbox));
const pending = (kind: Kind, id: string) => outbox.includes(`${kind}:${id}`);

function enqueue(kind: Kind, id: string) {
  const key = `${kind}:${id}`;
  if (!outbox.includes(key)) outbox.push(key);
  saveOutbox();
  queueMicrotask(flush);
}

const coll = { memo: 'memos', task: 'tasks', pick: 'picks' } as const;

function payload(kind: Kind, item: Memo | Task | Pick): unknown {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, ...rest } = item as Memo & Task & Pick;
  if (kind === 'memo') {
    const m = item as Memo;
    return { day: m.day, body: m.body, createdAt: m.createdAt, updatedAt: m.updatedAt, deletedAt: m.deletedAt };
  }
  return rest;
}

let flushing = false;
export async function flush(): Promise<void> {
  if (flushing || !getState().user || !navigator.onLine) return;
  flushing = true;
  try {
    while (outbox.length) {
      const key = outbox[0];
      const [kind, id] = key.split(':') as [Kind, string];
      const item = getState()[coll[kind]][id] as Memo | Task | Pick | undefined;
      if (!item) {
        outbox.shift();
        saveOutbox();
        continue;
      }
      try {
        const res = await req<{ item: Memo | Task | Pick }>('PUT', `/api/${coll[kind]}/${encodeURIComponent(id)}`, payload(kind, item));
        const local = getState()[coll[kind]][id];
        // 送信中に端末側で更新されたら、最新の内容をもう一度送る
        if (local && local !== item) continue;
        outbox.shift();
        saveOutbox();
        if (item.deletedAt) {
          removeLocal(kind, id); // 削除がサーバーに届いたら端末からも消す
        } else if (local) {
          putLocal(kind, kind === 'memo' ? { ...res.item, analysis: (res.item as Memo).analysis ?? (local as Memo).analysis } : res.item);
        }
      } catch (e) {
        if (e instanceof HttpError && e.status === 401) {
          setState({ user: null });
          break;
        }
        if (e instanceof HttpError && (e.status === 400 || e.status === 409)) {
          outbox.shift();
          saveOutbox();
          continue;
        }
        break; // 通信エラーは後で再送
      }
    }
  } finally {
    flushing = false;
  }
}

function putLocal(kind: Kind, item: Memo | Task | Pick) {
  const k = coll[kind];
  setState((s) => ({ [k]: { ...s[k], [item.id]: item } }) as Partial<typeof s>);
}

function removeLocal(kind: Kind, id: string) {
  const k = coll[kind];
  setState((s) => {
    const next = { ...s[k] };
    delete next[id];
    return { [k]: next } as Partial<typeof s>;
  });
}

/** サーバーの一覧で、その範囲の端末データを置き換える（未送信の変更は残す） */
function mergeScope<T extends Memo | Task | Pick>(kind: Kind, inScope: (x: T) => boolean, server: T[]) {
  const k = coll[kind];
  setState((s) => {
    const cur = s[k] as Record<string, T>;
    const next: Record<string, T> = {};
    for (const [id, x] of Object.entries(cur)) {
      if (!inScope(x) || pending(kind, id)) next[id] = x;
    }
    for (const x of server) {
      const local = cur[x.id];
      if (local && pending(kind, x.id) && local.updatedAt > x.updatedAt) continue;
      next[x.id] = x;
    }
    return { [k]: next } as Partial<typeof s>;
  });
}

// ---------------- 認証 ----------------
export async function checkAuth(): Promise<void> {
  try {
    const { user } = await req<{ user: User }>('GET', '/api/me');
    const s = getState();
    // 別アカウントでログインしたら、前の持ち主の端末データは送らずに破棄する
    if (s.ownerId && s.ownerId !== user.id) {
      outbox = [];
      saveOutbox();
      resetLocalData();
    }
    setState({ user, ownerId: user.id, authChecked: true });
    await flush();
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) setState({ user: null, authChecked: true });
    else setState({ authChecked: true }); // オフライン時は前回のログイン状態のまま
  }
}

export async function logout(): Promise<void> {
  await flush().catch(() => undefined);
  await req('POST', '/auth/logout').catch(() => undefined);
  outbox = [];
  saveOutbox();
  resetLocalData();
  setState({ user: null, sheet: null });
  persistNow();
}

export function login(): void {
  location.href = `/auth/login?next=${encodeURIComponent('/')}`;
}

// ---------------- 取得 ----------------
const inflight = new Map<string, Promise<void>>();
function once(key: string, fn: () => Promise<void>): Promise<void> {
  const cur = inflight.get(key);
  if (cur) return cur;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

const markLoaded = (key: string) => setState((s) => ({ loaded: { ...s.loaded, [key]: true } }));

export function pullMemos(day: string): Promise<void> {
  return once(`memo:${day}`, async () => {
    if (!getState().user) return;
    try {
      const { memos } = await req<{ memos: Memo[] }>('GET', `/api/memos?day=${day}`);
      mergeScope<Memo>('memo', (m) => m.day === day, memos);
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) setState({ user: null });
    }
    markLoaded(`memo:${day}`);
  });
}

export function pullPicks(day: string): Promise<void> {
  return once(`pick:${day}`, async () => {
    if (!getState().user) return;
    try {
      const { picks } = await req<{ picks: Pick[] }>('GET', `/api/picks?day=${day}`);
      mergeScope<Pick>('pick', (p) => p.day === day, picks);
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) setState({ user: null });
    }
    markLoaded(`pick:${day}`);
  });
}

export function pullTasks(): Promise<void> {
  return once('task', async () => {
    if (!getState().user) return;
    try {
      const { tasks } = await req<{ tasks: Task[] }>('GET', '/api/tasks');
      mergeScope<Task>('task', () => true, tasks);
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) setState({ user: null });
    }
    markLoaded('task');
  });
}

export async function relatedMemos(code: string): Promise<Memo[]> {
  if (!getState().user) return Object.values(getState().memos).filter((m) => !m.deletedAt && m.codes.includes(code));
  const { memos } = await req<{ memos: Memo[] }>('GET', `/api/memos?code=${code}`);
  return memos;
}

export function loadMarket(code: string, range: Range): void {
  const key = `${code}:${range}`;
  const cur = getState().market[key];
  if (cur && cur !== 'error') return;
  if (!getState().user) return;
  setState((s) => ({ market: { ...s.market, [key]: 'loading' } }));
  req<{ market: Market }>('GET', `/api/market/${code}?range=${range}`)
    .then(({ market }) => {
      setState((s) => ({ market: { ...s.market, [key]: market } }));
      // 銘柄名が空なら取得した名前で補う
      for (const p of Object.values(getState().picks)) {
        if (p.code === code && !p.name && market.name) savePick({ ...p, name: market.name });
      }
    })
    .catch(() => setState((s) => ({ market: { ...s.market, [key]: 'error' } })));
}

// ---------------- 変更 ----------------
const uid = () => crypto.randomUUID();

export function addMemo(body: string, opts: { id?: string; at?: number; day?: string } = {}): Memo {
  const at = opts.at ?? Date.now();
  const memo: Memo = {
    id: opts.id ?? uid(),
    day: opts.day ?? getState().day,
    body,
    codes: extractCodes(body),
    analysis: null,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };
  putLocal('memo', memo);
  enqueue('memo', memo.id);
  return memo;
}

export function deleteMemo(id: string): void {
  const m = getState().memos[id];
  if (!m) return;
  putLocal('memo', { ...m, deletedAt: Date.now(), updatedAt: Date.now() });
  enqueue('memo', id);
  toast('メモを削除', {
    label: '元に戻す',
    run: () => {
      putLocal('memo', { ...m, deletedAt: null, updatedAt: Date.now() });
      enqueue('memo', id);
      setState({ toast: null });
    },
  });
}

export async function analyzeMemo(id: string): Promise<void> {
  const s = getState();
  if (!s.user) return setState({ sheet: { kind: 'login' } });
  if (s.analyzing[id]) return;
  setState((st) => ({ analyzing: { ...st.analyzing, [id]: true } }));
  try {
    await flush();
    if (pending('memo', id)) throw new HttpError(0);
    const { analysis } = await req<{ analysis: Analysis }>('POST', `/api/ai/memo/${id}`);
    const m = getState().memos[id];
    if (m) putLocal('memo', { ...m, analysis });
  } catch (e) {
    toast(e instanceof HttpError && e.status === 429 ? '本日のAI利用上限に達しました' : 'AI分析に失敗しました');
  } finally {
    setState((st) => {
      const a = { ...st.analyzing };
      delete a[id];
      return { analyzing: a };
    });
  }
}

export function addTask(title: string, code: string | null = null): Task {
  const now = Date.now();
  const task: Task = { id: uid(), title: title.trim(), status: 'todo', code, createdAt: now, updatedAt: now, deletedAt: null };
  putLocal('task', task);
  enqueue('task', task.id);
  return task;
}

export function setTaskStatus(id: string, status: TaskStatus): void {
  const t = getState().tasks[id];
  if (!t || t.status === status) return;
  putLocal('task', { ...t, status, updatedAt: Date.now() });
  enqueue('task', id);
}

export function deleteTask(id: string): void {
  const t = getState().tasks[id];
  if (!t) return;
  putLocal('task', { ...t, deletedAt: Date.now(), updatedAt: Date.now() });
  enqueue('task', id);
  toast('タスクを削除', {
    label: '元に戻す',
    run: () => {
      putLocal('task', { ...t, deletedAt: null, updatedAt: Date.now() });
      enqueue('task', id);
      setState({ toast: null });
    },
  });
}

export function newPick(code: string, fields: Partial<Pick> = {}): Pick {
  const now = Date.now();
  const pick: Pick = {
    id: uid(),
    day: getState().day,
    code,
    name: '',
    theme: '',
    headline: '',
    reaction: '',
    caveat: '',
    mark: null,
    metrics: {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...fields,
  };
  putLocal('pick', pick);
  enqueue('pick', pick.id);
  return pick;
}

export function pickFromAnalysis(item: AnalysisItem, day: string): Pick | null {
  if (!item.code) return null;
  return newPick(item.code, {
    day,
    name: item.name,
    theme: item.theme,
    headline: item.headline,
    reaction: item.reaction,
    caveat: item.caveat,
    mark: item.mark,
  });
}

export function savePick(p: Pick): void {
  putLocal('pick', { ...p, updatedAt: Date.now() });
  enqueue('pick', p.id);
}

export function deletePick(id: string): void {
  const p = getState().picks[id];
  if (!p) return;
  putLocal('pick', { ...p, deletedAt: Date.now(), updatedAt: Date.now() });
  enqueue('pick', id);
  if (getState().sheet?.kind === 'pick') setState({ sheet: null });
  toast('銘柄を削除', {
    label: '元に戻す',
    run: () => {
      putLocal('pick', { ...p, deletedAt: null, updatedAt: Date.now() });
      enqueue('pick', id);
      setState({ toast: null });
    },
  });
}

export async function aiFillPick(id: string): Promise<void> {
  if (!getState().user) return setState({ sheet: { kind: 'login' } });
  setState((st) => ({ analyzing: { ...st.analyzing, [id]: true } }));
  try {
    await flush();
    const { item } = await req<{ item: Pick }>('POST', `/api/ai/pick/${id}`);
    putLocal('pick', item);
  } catch (e) {
    toast(e instanceof HttpError && e.status === 429 ? '本日のAI利用上限に達しました' : 'AI補完に失敗しました');
  } finally {
    setState((st) => {
      const a = { ...st.analyzing };
      delete a[id];
      return { analyzing: a };
    });
  }
}

// オンライン復帰・定期的に再送
addEventListener('online', () => void flush());
setInterval(() => outbox.length && void flush(), 15_000);
