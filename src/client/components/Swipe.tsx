import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { haptic, reduced, spring, tween } from '../motion';

export interface SwipeAction {
  label: ComponentChildren;
  color: string;
  run: () => void;
}

interface Props {
  left?: SwipeAction | null; // 左へ払ったとき
  right?: SwipeAction | null; // 右へ払ったとき
  children: ComponentChildren;
  testId?: string;
  flip?: string;
}

/**
 * フリック操作の共通部品。
 * 横方向の移動が縦より大きいときだけ反応し、縦スクロールは邪魔しない。
 * 指を離した位置（しきい値）または速度で確定する。
 */
export function Swipe({ left, right, children, testId, flip }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const g = useRef({ id: -1, x0: 0, y0: 0, dx: 0, lock: '' as '' | 'h' | 'v', armed: false, samples: [] as [number, number][], stop: () => {} });

  const setDx = (dx: number) => {
    const el = root.current;
    if (!el) return;
    el.style.setProperty('--dx', `${dx}px`);
    el.style.setProperty('--rot', `${dx * 0.012}deg`);
    const bg = el.querySelector<HTMLElement>('.swipe-bg');
    if (bg) {
      const act = dx > 0 ? right : left;
      bg.style.opacity = act && Math.abs(dx) > 4 ? String(Math.min(1, Math.abs(dx) / 60)) : '0';
      bg.style.background = act?.color ?? 'transparent';
      el.dataset.dir = dx > 0 ? 'r' : 'l';
    }
  };

  const threshold = () => Math.min(120, (root.current?.offsetWidth ?? 300) * 0.3);

  const onDown = (e: PointerEvent) => {
    // ボタンの上から始めても払えるようにする（払った場合はボタンのクリックにならない）
    if (e.button !== 0 || (e.target as HTMLElement).closest('a, input, textarea')) return;
    g.current.stop();
    g.current = { ...g.current, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, lock: '', armed: false, samples: [[e.timeStamp, e.clientX]] };
  };

  const onMove = (e: PointerEvent) => {
    const s = g.current;
    if (e.pointerId !== s.id) return;
    const dx = e.clientX - s.x0;
    const dy = e.clientY - s.y0;
    if (!s.lock) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        s.lock = 'h';
        root.current?.setPointerCapture(e.pointerId);
        root.current?.classList.add('dragging');
      } else if (Math.abs(dy) > 8) {
        s.lock = 'v';
      }
    }
    if (s.lock !== 'h') return;
    e.preventDefault();
    const act = dx > 0 ? right : left;
    // 動作がない方向はゴムのように抵抗させる
    const eff = act ? dx : dx * 0.22;
    s.dx = eff;
    s.samples.push([e.timeStamp, e.clientX]);
    if (s.samples.length > 6) s.samples.shift();
    const armed = !!act && Math.abs(eff) > threshold();
    if (armed !== s.armed) {
      s.armed = armed;
      root.current?.classList.toggle('armed', armed);
      if (armed) haptic(10);
    }
    setDx(eff);
  };

  const finish = (e: PointerEvent) => {
    const s = g.current;
    if (e.pointerId !== s.id) return;
    s.id = -1;
    const el = root.current;
    el?.classList.remove('dragging', 'armed');
    if (s.lock !== 'h') return;
    const [t0, x0] = s.samples[0];
    const [t1, x1] = s.samples[s.samples.length - 1];
    const vel = (x1 - x0) / Math.max(1, t1 - t0); // px/ms
    const act = s.dx > 0 ? right : left;
    const commit = !!act && (Math.abs(s.dx) > threshold() || (Math.abs(vel) > 0.6 && Math.abs(s.dx) > 40 && Math.sign(vel) === Math.sign(s.dx)));
    if (commit && act) {
      haptic(14);
      const w = (el?.offsetWidth ?? 320) * 1.1 * Math.sign(s.dx);
      const run = () => {
        act.run();
        setDx(0);
        el?.classList.remove('pop-in');
        if (el && !reduced()) {
          void el.offsetWidth;
          el.classList.add('pop-in');
        }
      };
      if (reduced()) return run();
      s.stop = tween(s.dx, w, 190, (v) => setDx(v), run);
    } else {
      s.stop = spring(s.dx, 0, (v) => setDx(v), { stiffness: 520, damping: 30, velocity: vel * 1000 });
    }
  };

  return (
    <div
      ref={root}
      class="swipe"
      data-testid={testId}
      data-flip={flip}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      <div class="swipe-bg" aria-hidden="true">
        <span class="side r">{right?.label}</span>
        <span class="side l">{left?.label}</span>
      </div>
      <div class="swipe-fg">{children}</div>
    </div>
  );
}
