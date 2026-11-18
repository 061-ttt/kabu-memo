import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

export const reduced = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** ばね（臨界減衰に近い設定）で値を動かす。戻り値で停止できる */
export function spring(
  from: number,
  to: number,
  onUpdate: (v: number, vel: number) => void,
  opts: { stiffness?: number; damping?: number; velocity?: number; onDone?: () => void } = {},
): () => void {
  const { stiffness = 420, damping = 34, onDone } = opts;
  if (reduced()) {
    onUpdate(to, 0);
    onDone?.();
    return () => undefined;
  }
  let x = from;
  let v = opts.velocity ?? 0;
  let last = performance.now();
  let raf = 0;
  const step = (now: number) => {
    const dt = Math.min(0.032, (now - last) / 1000);
    last = now;
    const a = -stiffness * (x - to) - damping * v;
    v += a * dt;
    x += v * dt;
    if (Math.abs(v) < 12 && Math.abs(x - to) < 0.5) {
      onUpdate(to, 0);
      onDone?.();
      return;
    }
    onUpdate(x, v);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/** 一定時間で値を動かす（加速しながら抜けていく動き） */
export function tween(from: number, to: number, ms: number, onUpdate: (v: number) => void, onDone?: () => void): () => void {
  if (reduced()) {
    onUpdate(to);
    onDone?.();
    return () => undefined;
  }
  const start = performance.now();
  let raf = 0;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    onUpdate(from + (to - from) * (t * t * (3 - 2 * t)));
    if (t < 1) raf = requestAnimationFrame(step);
    else onDone?.();
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/** 数値を前の値から滑らかに数え上げる */
export function useCountUp(value: number | null, ms = 700): number | null {
  const [shown, setShown] = useState(value);
  const prev = useRef<number | null>(null);
  useEffect(() => {
    if (value == null) return setShown(null);
    const from = prev.current ?? value * 0.92;
    prev.current = value;
    if (reduced()) return setShown(value);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 4);
      setShown(from + (value - from) * e);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

/** 並び替え時に要素を元の位置から新しい位置へ滑らせる（FLIP） */
export function useFlip(container: { current: HTMLElement | null }, deps: unknown[]): void {
  const rects = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const el = container.current;
    if (!el) return;
    const items = [...el.querySelectorAll<HTMLElement>('[data-flip]')];
    if (!reduced()) {
      for (const item of items) {
        const key = item.dataset.flip!;
        const before = rects.current.get(key);
        const after = item.getBoundingClientRect();
        if (before && (Math.abs(before.top - after.top) > 1 || Math.abs(before.left - after.left) > 1)) {
          item.animate(
            [{ transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)` }, { transform: 'none' }],
            { duration: 520, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)' },
          );
        }
      }
    }
    const next = new Map<string, DOMRect>();
    for (const item of items) next.set(item.dataset.flip!, item.getBoundingClientRect());
    rects.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** ガラスの反射光をポインタ位置に合わせる */
export function installSheen(): void {
  if (reduced() || matchMedia('(pointer: coarse)').matches) return;
  addEventListener(
    'pointermove',
    (e) => {
      const el = (e.target as HTMLElement | null)?.closest?.('.glass') as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
      el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
    },
    { passive: true },
  );
}

export function haptic(ms = 8): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* 非対応端末 */
  }
}
