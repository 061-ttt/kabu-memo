import { extractCodes } from '../shared/codes';
import { todayJst } from '../shared/day';
import { addMemo } from './data';
import { reduced } from './motion';

declare global {
  interface Window {
    __kmSave?: (text: string) => void;
  }
}

/**
 * index.html に静的に置いたメモ欄を引き継ぐ。
 * JSが届く前から入力・保存できるように、要素は作り直さず振る舞いだけ足す。
 */
export function enhanceComposer(): void {
  const t = document.getElementById('memo-input') as HTMLTextAreaElement;
  const chips = document.getElementById('memo-chips') as HTMLElement;
  let shown: string[] = [];

  const grow = () => {
    t.style.height = 'auto';
    t.style.height = `${Math.max(44, t.scrollHeight)}px`;
  };
  const renderChips = () => {
    const codes = extractCodes(t.value).slice(0, 6);
    if (codes.join() === shown.join()) return;
    shown = codes;
    chips.replaceChildren(
      ...codes.map((c) => {
        const el = document.createElement('span');
        el.className = 'chip';
        el.textContent = c;
        return el;
      }),
    );
  };
  t.addEventListener('input', () => {
    grow();
    renderChips();
  });

  window.__kmSave = (text: string) => {
    const memo = addMemo(text);
    fly(t, text, memo.id);
    t.value = '';
    try {
      localStorage.removeItem('km:draft');
    } catch {
      /* noop */
    }
    grow();
    renderChips();
  };

  // JS 読み込み前に保存されたメモを取り込む
  try {
    const q = JSON.parse(localStorage.getItem('km:bootq') || '[]') as { id: string; body: string; at: number }[];
    for (const m of q) addMemo(m.body, { id: m.id, at: m.at, day: todayJst(m.at) });
    localStorage.removeItem('km:bootq');
  } catch {
    /* noop */
  }
  grow();
  renderChips();
}

/** 入力欄の文字が一覧のカードへ飛んでいくアニメーション */
function fly(from: HTMLElement, text: string, id: string) {
  if (reduced()) return;
  const a = from.getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = 'ghost';
  ghost.textContent = text;
  Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, maxHeight: `${Math.max(48, a.height)}px` });
  document.body.append(ghost);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const target = document.querySelector(`[data-id="${id}"]`) ?? document.querySelector('[data-tab="memo"]');
      const b = target?.getBoundingClientRect();
      const dx = b ? b.left - a.left : 0;
      const dy = b ? b.top - a.top : 80;
      const anim = ghost.animate(
        [
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(${b && target?.matches('[data-tab]') ? 0.2 : 1})`, opacity: 0 },
        ],
        { duration: 560, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
      anim.onfinish = () => ghost.remove();
    }),
  );
}
