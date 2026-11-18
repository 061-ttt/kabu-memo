import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { todayJst } from '../shared/day';
import type { Market, Memo, Pick, Task, User } from '../shared/types';

export type Tab = 'memo' | 'pick' | 'task';
export type Kind = 'memo' | 'task' | 'pick';
export type Sheet = { kind: 'pick'; id: string } | { kind: 'addPick' } | { kind: 'login' } | null;
export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

export interface State {
  user: User | null;
  ownerId: string | null; // 端末に保存しているデータの持ち主（未ログイン時は null）
  authChecked: boolean;
  day: string;
  tab: Tab;
  dir: 'r' | 'l' | 'u';
  memos: Record<string, Memo>;
  tasks: Record<string, Task>;
  picks: Record<string, Pick>;
  loaded: Record<string, true>;
  analyzing: Record<string, true>;
  market: Record<string, Market | 'error' | 'loading'>;
  sheet: Sheet;
  toast: Toast | null;
  pickFilter: 'all' | 'strong' | 'weak';
  pickQuery: string;
  taskFilter: 'active' | 'done' | 'all';
}

const KEY = 'km:v1';

interface Persisted {
  user: User | null;
  ownerId: string | null;
  memos: Record<string, Memo>;
  tasks: Record<string, Task>;
  picks: Record<string, Pick>;
}

function load(): Partial<Persisted> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function safeGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

const saved = load();

let state: State = {
  user: saved.user ?? null,
  ownerId: saved.ownerId ?? null,
  authChecked: false,
  day: todayJst(),
  tab: (safeGet('km:tab') as Tab) || 'memo',
  dir: 'u',
  memos: saved.memos ?? {},
  tasks: saved.tasks ?? {},
  picks: saved.picks ?? {},
  loaded: {},
  analyzing: {},
  market: {},
  sheet: null,
  toast: null,
  pickFilter: 'all',
  pickQuery: '',
  taskFilter: 'active',
};

const subs = new Set<() => void>();
let persistTimer: ReturnType<typeof setTimeout> | undefined;

export function getState(): State {
  return state;
}

export function setState(patch: Partial<State> | ((s: State) => Partial<State>)): void {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  if ('memos' in next || 'tasks' in next || 'picks' in next || 'user' in next || 'ownerId' in next) schedulePersist();
  if ('tab' in next) {
    try {
      sessionStorage.setItem('km:tab', state.tab);
    } catch {
      /* 使えない環境では覚えない */
    }
  }
  subs.forEach((f) => f());
}

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 120);
}

export function persistNow(): void {
  clearTimeout(persistTimer);
  const data: Persisted = { user: state.user, ownerId: state.ownerId, memos: state.memos, tasks: state.tasks, picks: state.picks };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* 容量超過などは無視（サーバー同期が正） */
  }
}

addEventListener('pagehide', persistNow);
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && persistNow());

export function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function useStore<T>(select: (s: State) => T): T {
  const [, force] = useState(0);
  const sel = useRef(select);
  sel.current = select;
  const value = select(state);
  const last = useRef(value);
  last.current = value;
  useLayoutEffect(() => {
    const check = () => {
      if (!Object.is(sel.current(state), last.current)) force((n) => n + 1);
    };
    const unsub = subscribe(check);
    check(); // 描画から購読開始までの間に起きた変更を取りこぼさない
    return unsub;
  }, []);
  return value;
}

let toastSeq = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string, action?: Toast['action'], ms = 4200): void {
  clearTimeout(toastTimer);
  const id = ++toastSeq;
  setState({ toast: { id, text, action } });
  toastTimer = setTimeout(() => getState().toast?.id === id && setState({ toast: null }), ms);
}

export function resetLocalData(): void {
  setState({ memos: {}, tasks: {}, picks: {}, loaded: {}, market: {}, ownerId: null });
  persistNow();
}
