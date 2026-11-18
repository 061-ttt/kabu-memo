import type { Candle } from '../../shared/types';

const W = 360;
const H = 220;
const PAD_R = 46;
const VOL_H = 40;

/** 日足ローソク足＋出来高。陽線は赤、陰線は青（日本式） */
export function CandleChart({ candles }: { candles: Candle[] }) {
  if (!candles.length) return null;
  const hi = Math.max(...candles.map((c) => c.h));
  const lo = Math.min(...candles.map((c) => c.l));
  const span = hi - lo || 1;
  const maxV = Math.max(...candles.map((c) => c.v)) || 1;
  const plotH = H - VOL_H - 16;
  const step = (W - PAD_R) / candles.length;
  const bw = Math.max(1.5, step * 0.62);
  const y = (p: number) => 8 + ((hi - p) / span) * plotH;
  const last = candles[candles.length - 1];
  const ticks = [hi, lo + span / 2, lo].filter((t) => Math.abs(y(t) - y(last.c)) > 14);
  const first = new Date(candles[0].t * 1000);
  const end = new Date(last.t * 1000);
  const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return (
    <svg class="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="日足チャート" data-testid="chart">
      {ticks.map((t) => (
        <g key={t}>
          <line x1="0" x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke="rgba(15,23,42,.06)" stroke-dasharray="3 4" />
          <text x={W - PAD_R + 4} y={y(t) + 4} font-size="10" fill="#7c8496">
            {Math.round(t).toLocaleString('ja-JP')}
          </text>
        </g>
      ))}
      {candles.map((c, i) => {
        const x = i * step + step / 2;
        const up = c.c >= c.o;
        const color = up ? '#e5383b' : '#2563eb';
        const top = y(Math.max(c.o, c.c));
        const h = Math.max(1, Math.abs(y(c.o) - y(c.c)));
        const vh = (c.v / maxV) * VOL_H;
        return (
          <g key={c.t} class="candle" style={{ '--i': i }}>
            <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={color} stroke-width="1" />
            <rect x={x - bw / 2} y={top} width={bw} height={h} fill={up ? color : color} rx="0.6" />
            <rect x={x - bw / 2} y={H - vh - 12} width={bw} height={vh} fill={up ? 'rgba(229,56,59,.28)' : 'rgba(37,99,235,.28)'} />
          </g>
        );
      })}
      <line x1="0" x2={W - PAD_R} y1={y(last.c)} y2={y(last.c)} stroke="#0d1017" stroke-width="0.8" stroke-dasharray="2 3" opacity=".5" />
      <rect x={W - PAD_R + 2} y={y(last.c) - 9} width={PAD_R - 4} height="18" rx="5" fill="#0d1017" />
      <text x={W - PAD_R / 2} y={y(last.c) + 4} font-size="10.5" font-weight="700" fill="#fff" text-anchor="middle">
        {Math.round(last.c).toLocaleString('ja-JP')}
      </text>
      <text x="2" y={H - 1} font-size="9.5" fill="#a9b0bf">
        {md(first)}
      </text>
      <text x={W - PAD_R} y={H - 1} font-size="9.5" fill="#a9b0bf" text-anchor="end">
        {md(end)}
      </text>
    </svg>
  );
}

export function Sparkline({ candles }: { candles: Candle[] }) {
  if (candles.length < 2) return <svg class="spark" />;
  const closes = candles.map((c) => c.c);
  const hi = Math.max(...closes);
  const lo = Math.min(...closes);
  const span = hi - lo || 1;
  const pts = closes.map((c, i) => [(i / (closes.length - 1)) * 84, 26 - ((c - lo) / span) * 24]);
  const d = pts.map(([x, yy], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${yy.toFixed(1)}`).join('');
  const up = closes[closes.length - 1] >= closes[0];
  const color = up ? '#e5383b' : '#2563eb';
  const id = `g${up ? 'u' : 'd'}`;
  return (
    <svg class="spark" viewBox="0 0 84 28" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color={color} stop-opacity=".22" />
          <stop offset="1" stop-color={color} stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d}L84,28L0,28Z`} fill={`url(#${id})`} />
      <path class="line" d={d} stroke={color} />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2" fill={color} />
    </svg>
  );
}
