import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { addDays, formatDayShort, todayJst } from '../../shared/day';
import { login, logout } from '../data';
import { spring } from '../motion';
import { LOCAL_ONLY } from '../config';
import { getState, setState, type Tab, useStore } from '../store';
import { IconChart, IconCheck, IconLeft, IconMemo, IconRight, IconUser } from './icons';

export function DateNav() {
  const day = useStore((s) => s.day);
  const today = todayJst();
  const go = (n: number) => {
    const next = addDays(day, n);
    if (next > today) return;
    setState({ day: next, dir: n > 0 ? 'r' : 'l' });
  };
  return (
    <div class="datenav">
      <button class="icon-btn press" aria-label="前の日" onClick={() => go(-1)} data-testid="day-prev">
        <IconLeft />
      </button>
      <button
        class={`day press${day !== today ? ' past' : ''}`}
        onClick={() => day !== today && setState({ day: today, dir: 'r' })}
        aria-label={day === today ? '今日' : '今日に戻る'}
        data-testid="day-label"
      >
        <span key={day} class="enter-u" style={{ display: 'inline-block' }}>
          {formatDayShort(day)}
        </span>
      </button>
      <button class="icon-btn press" aria-label="次の日" onClick={() => go(1)} disabled={day >= today} style={{ opacity: day >= today ? 0.3 : 1 }} data-testid="day-next">
        <IconRight />
      </button>
    </div>
  );
}

export function UserMenu() {
  const user = useStore((s) => s.user);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => !(e.target as HTMLElement).closest('.user-slot') && setOpen(false);
    addEventListener('pointerdown', close);
    return () => removeEventListener('pointerdown', close);
  }, [open]);
  if (LOCAL_ONLY) return null;
  if (!user)
    return (
      <button class="login-btn press" onClick={login} data-testid="login">
        ログイン
      </button>
    );
  return (
    <>
      <button class="avatar press" aria-label="アカウント" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="avatar">
        {user.picture ? <img src={user.picture} alt="" referrerpolicy="no-referrer" /> : user.name?.[0] ?? <IconUser />}
      </button>
      {open && (
        <div class="menu glass" role="menu">
          <div class="email" data-testid="user-email">{user.email}</div>
          <button role="menuitem" onClick={() => void logout()} data-testid="logout">
            ログアウト
          </button>
        </div>
      )}
    </>
  );
}

const TABS: { id: Tab; label: string; icon: () => ComponentChildren }[] = [
  { id: 'memo', label: 'メモ', icon: () => <IconMemo /> },
  { id: 'pick', label: '銘柄', icon: () => <IconChart /> },
  { id: 'task', label: 'タスク', icon: () => <IconCheck /> },
];

export function switchTab(tab: Tab): void {
  const cur = getState().tab;
  if (cur === tab) return;
  const order = TABS.map((t) => t.id);
  setState({ tab, dir: order.indexOf(tab) > order.indexOf(cur) ? 'r' : 'l', sheet: null });
  scrollTo({ top: 0, behavior: 'smooth' });
}

/** 液体のように伸び縮みしながら移動するインジケーター付きのタブバー */
export function TabBar({ counts }: { counts: Record<Tab, number> }) {
  const tab = useStore((s) => s.tab);
  const bar = useRef<HTMLElement>(null);
  const ind = useRef<HTMLDivElement>(null);
  const pos = useRef<number | null>(null);
  const stop = useRef(() => {});
  const prevCounts = useRef(counts);
  const [bump, setBump] = useState<Tab | null>(null);

  useLayoutEffect(() => {
    const el = bar.current;
    const i = ind.current;
    if (!el || !i) return;
    const btn = el.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
    if (!btn) return;
    const target = btn.offsetLeft;
    const width = btn.offsetWidth;
    i.style.width = `${width}px`;
    if (pos.current == null) {
      pos.current = target;
      i.style.transform = `translateX(${target}px)`;
      return;
    }
    stop.current();
    stop.current = spring(
      pos.current,
      target,
      (x, v) => {
        pos.current = x;
        const stretch = 1 + Math.min(0.35, Math.abs(v) / 2600);
        i.style.transform = `translateX(${x}px) scaleX(${stretch}) scaleY(${2 - stretch})`;
      },
      { stiffness: 380, damping: 30 },
    );
  }, [tab]);

  useEffect(() => {
    for (const t of TABS) {
      if (counts[t.id] > prevCounts.current[t.id]) {
        setBump(t.id);
        setTimeout(() => setBump(null), 650);
      }
    }
    prevCounts.current = counts;
  }, [counts.memo, counts.pick, counts.task]);

  return (
    <nav class="tabbar glass" ref={bar} role="tablist" aria-label="画面">
      <div class="tab-ind" ref={ind} aria-hidden="true" />
      {TABS.map((t) => (
        <button
          key={t.id}
          class="tab press"
          role="tab"
          data-tab={t.id}
          data-testid={`tab-${t.id}`}
          aria-selected={tab === t.id}
          onClick={() => switchTab(t.id)}
        >
          {t.icon()}
          <span>{t.label}</span>
          {counts[t.id] > 0 && (
            <span class={`badge${bump === t.id ? ' bump' : ''}`} data-testid={`badge-${t.id}`}>
              {counts[t.id]}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}

export function ToastView() {
  const t = useStore((s) => s.toast);
  if (!t) return null;
  return (
    <div class="toast" role="status" key={t.id} data-testid="toast">
      <span>{t.text}</span>
      {t.action && (
        <button class="press" onClick={t.action.run} data-testid="toast-action">
          {t.action.label}
        </button>
      )}
    </div>
  );
}

/** 下から出るシート。上部をつかんで下に引くと閉じる */
export function Sheet({ children, onClose, label }: { children: ComponentChildren; onClose: () => void; label: string }) {
  const [closing, setClosing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ y0: 0, dy: 0, id: -1 });
  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 260);
  };
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    addEventListener('keydown', onKey);
    document.documentElement.style.overflow = 'hidden';
    return () => {
      removeEventListener('keydown', onKey);
      document.documentElement.style.overflow = '';
    };
  }, []);
  const down = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea, a')) return;
    if ((ref.current?.scrollTop ?? 0) > 0) return;
    drag.current = { y0: e.clientY, dy: 0, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (drag.current.id !== e.pointerId) return;
    const dy = Math.max(0, e.clientY - drag.current.y0);
    drag.current.dy = dy;
    ref.current?.style.setProperty('--dy', `${dy}px`);
  };
  const up = (e: PointerEvent) => {
    if (drag.current.id !== e.pointerId) return;
    drag.current.id = -1;
    const dy = drag.current.dy;
    if (dy > 110) return close();
    spring(dy, 0, (v) => ref.current?.style.setProperty('--dy', `${v}px`));
  };
  return (
    <>
      <div class={`scrim${closing ? ' closing' : ''}`} onClick={close} data-testid="scrim" />
      <div class={`sheet glass${closing ? ' closing' : ''}`} ref={ref} role="dialog" aria-modal="true" aria-label={label} data-testid="sheet">
        <div class="sheet-grab" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={{ touchAction: 'none' }}>
          <div class="grabber" />
        </div>
        {children}
      </div>
    </>
  );
}
