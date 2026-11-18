import { useEffect, useRef, useState } from 'preact/hooks';
import { isStockCode, toHalfWidth } from '../../shared/codes';
import { RANGES, type Market, type Memo, type Metrics, type Pick, type Range } from '../../shared/types';
import { aiFillPick, deletePick, loadMarket, login, newPick, relatedMemos, savePick } from '../data';
import { useCountUp, useFlip } from '../motion';
import { LOCAL_ONLY } from '../config';
import { getState, setState, useStore } from '../store';
import { CandleChart, Sparkline } from './Chart';
import { Sheet } from './Chrome';
import { MarkBadge } from './MemoView';
import { ScreenSkeleton, SheetSkeleton } from './Skeleton';
import { Swipe } from './Swipe';
import { IconExternal, IconFlame, IconPlus, IconSearch, IconSnow, IconSpark, IconTrash } from './icons';

const fmt = (n: number | null | undefined, d = 0) =>
  n == null || Number.isNaN(n) ? '—' : n.toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d });

export function fmtCap(yen: number | null | undefined): string {
  if (yen == null) return '—';
  if (yen >= 1e12) return `${(yen / 1e12).toFixed(2)}兆`;
  if (yen >= 1e8) return `${Math.round(yen / 1e8).toLocaleString('ja-JP')}億`;
  return yen.toLocaleString('ja-JP');
}

function Change({ m }: { m: Market | undefined }) {
  if (!m || m.changePct == null) return <span class="chg flat">—</span>;
  const cls = m.changePct > 0 ? 'up' : m.changePct < 0 ? 'down' : 'flat';
  const sign = m.changePct > 0 ? '+' : '';
  return (
    <span class={`chg ${cls}`} data-testid="change">
      {sign}
      {m.changePct.toFixed(2)}%
    </span>
  );
}

export function PickView({ loading }: { loading: boolean }) {
  const day = useStore((s) => s.day);
  const picksMap = useStore((s) => s.picks);
  const filter = useStore((s) => s.pickFilter);
  const query = useStore((s) => s.pickQuery);
  const dir = useStore((s) => s.dir);
  const all = Object.values(picksMap)
    .filter((p) => p.day === day && !p.deletedAt)
    .sort((a, b) => a.createdAt - b.createdAt);
  const q = toHalfWidth(query.trim()).toLowerCase();
  const list = all.filter(
    (p) =>
      (filter === 'all' || p.mark === filter) &&
      (!q || [p.code, p.name, p.theme, p.headline].some((s) => s.toLowerCase().includes(q))),
  );
  const strong = all.filter((p) => p.mark === 'strong').length;
  const weak = all.filter((p) => p.mark === 'weak').length;
  const box = useRef<HTMLDivElement>(null);
  useFlip(box, [list.map((p) => p.id).join()]);

  if (loading && !all.length) return <ScreenSkeleton variant="pick" />;
  return (
    <div class={`view enter-${dir}`} key={day} data-testid="pick-view">
      <div class="toolbar">
        <label class="search glass">
          <IconSearch />
          <input
            type="search"
            value={query}
            onInput={(e) => setState({ pickQuery: (e.target as HTMLInputElement).value })}
            placeholder="銘柄名・コード・テーマ"
            aria-label="銘柄を検索"
            data-testid="pick-search"
          />
        </label>
        <button class="add-btn press" onClick={() => setState({ sheet: { kind: 'addPick' } })} data-testid="pick-add">
          <IconPlus /> 銘柄
        </button>
      </div>
      <div class="filters" role="group" aria-label="絞り込み">
        <button class="filter press" aria-pressed={filter === 'all'} onClick={() => setState({ pickFilter: 'all' })} data-testid="filter-all">
          すべて {all.length}
        </button>
        <button class="filter press" aria-pressed={filter === 'strong'} onClick={() => setState({ pickFilter: 'strong' })} data-testid="filter-strong">
          <IconFlame /> 強 {strong}
        </button>
        <button class="filter press" aria-pressed={filter === 'weak'} onClick={() => setState({ pickFilter: 'weak' })} data-testid="filter-weak">
          <IconSnow /> 弱 {weak}
        </button>
      </div>
      <div class="view stagger" ref={box}>
        {list.map((p, i) => (
          <PickRow key={p.id} pick={p} index={i} />
        ))}
        {!list.length && <p class="empty">0件</p>}
      </div>
    </div>
  );
}

function PickRow({ pick, index }: { pick: Pick; index: number }) {
  const m = useStore((s) => s.market[`${pick.code}:1mo`]);
  const user = useStore((s) => s.user);
  useEffect(() => {
    if (user) loadMarket(pick.code, '1mo');
  }, [pick.code, user?.id]);
  const market = m && typeof m === 'object' ? m : undefined;
  const price = useCountUp(market?.price ?? null);
  return (
    <div data-flip={pick.id} style={{ '--i': Math.min(index, 8) }}>
      <Swipe
        testId="pick-row"
        left={{
          label: (
            <>
              削除 <IconTrash />
            </>
          ),
          color: '#ef4444',
          run: () => deletePick(pick.id),
        }}
      >
        <div
          class={`card glass pick press${LOCAL_ONLY ? ' local' : ''}`}
          role="button"
          tabIndex={0}
          data-code={pick.code}
          onClick={() => setState({ sheet: { kind: 'pick', id: pick.id } })}
          onKeyDown={(e) => e.key === 'Enter' && setState({ sheet: { kind: 'pick', id: pick.id } })}
        >
          <div class="pick-name">
            <span>{pick.name || market?.name || pick.code}</span>
            <span class="code">{pick.code}</span>
          </div>
          {!LOCAL_ONLY && (
            <>
              <div class="pick-spark">{market && <Sparkline candles={market.candles} />}</div>
              <div class="pick-right">
                <span class="price">{price == null ? '—' : fmt(price)}</span>
                <Change m={market} />
              </div>
            </>
          )}
          {(pick.headline || pick.theme || pick.mark) && (
            <div class="pick-head">
              {pick.mark && (
                <span style={{ marginRight: 6 }}>
                  <MarkBadge mark={pick.mark} />
                </span>
              )}
              {pick.theme && (
                <span class="theme" style={{ marginRight: 6 }}>
                  {pick.theme}
                </span>
              )}
              {pick.headline}
            </div>
          )}
        </div>
      </Swipe>
    </div>
  );
}

// ---------------- 詳細シート ----------------
export function PickSheet({ id }: { id: string }) {
  const pick = useStore((s) => s.picks[id]);
  const user = useStore((s) => s.user);
  const [range, setRange] = useState<Range>('3mo');
  const m = useStore((s) => s.market[`${pick?.code}:${range}`]);
  const analyzing = useStore((s) => !!s.analyzing[id]);
  const [related, setRelated] = useState<Memo[] | null>(null);

  useEffect(() => {
    if (pick && user) loadMarket(pick.code, range);
  }, [pick?.code, range, user?.id]);
  useEffect(() => {
    if (!pick) return;
    relatedMemos(pick.code).then(setRelated).catch(() => setRelated([]));
  }, [pick?.code]);

  const close = () => setState({ sheet: null });
  if (!pick) return null;
  const market = m && typeof m === 'object' ? m : undefined;
  const update = (patch: Partial<Pick>) => {
    const cur = getState().picks[id];
    if (cur) savePick({ ...cur, ...patch });
  };
  const setMetric = (k: keyof Metrics, raw: string) => {
    const v = raw.trim() === '' ? null : Number(toHalfWidth(raw).replace(/[,，%％倍]/g, ''));
    update({ metrics: { ...pick.metrics, [k]: v == null || Number.isNaN(v) ? null : v } });
  };

  return (
    <Sheet onClose={close} label={`${pick.name || pick.code} の詳細`}>
      <div class="sheet-head">
        <div>
          <h2 class="sheet-title" data-testid="sheet-title">
            {pick.name || market?.name || pick.code}
          </h2>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
            <span class="code">{pick.code}</span>
            {pick.theme && <span class="theme">{pick.theme}</span>}
          </div>
        </div>
        <div class="marks" role="group" aria-label="強弱">
          <button class="strong" aria-pressed={pick.mark === 'strong'} onClick={() => update({ mark: pick.mark === 'strong' ? null : 'strong' })} data-testid="set-strong">
            <IconFlame />強
          </button>
          <button class="weak" aria-pressed={pick.mark === 'weak'} onClick={() => update({ mark: pick.mark === 'weak' ? null : 'weak' })} data-testid="set-weak">
            <IconSnow />弱
          </button>
        </div>
      </div>

      {LOCAL_ONLY ? null : !user ? (
        <div class="chart-wrap" style={{ padding: 16, marginTop: 14 }}>
          <button class="btn primary block press" onClick={login}>
            Googleでログイン
          </button>
        </div>
      ) : !market && m !== 'error' ? (
        <div style={{ marginTop: 14 }}>
          <SheetSkeleton />
        </div>
      ) : (
        <>
          <PriceBlock market={market} />
          <div class="chart-wrap">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 6px' }}>
              <span class="label" style={{ margin: 0 }}>
                日足
              </span>
              <div class="ranges" role="group" aria-label="期間">
                {RANGES.map((r) => (
                  <button key={r} aria-pressed={range === r} onClick={() => setRange(r)} data-testid={`range-${r}`}>
                    {r === '1mo' ? '1ヶ月' : r === '3mo' ? '3ヶ月' : '6ヶ月'}
                  </button>
                ))}
              </div>
            </div>
            {market ? <CandleChart key={range} candles={market.candles} /> : <p class="empty">株価を取得できませんでした</p>}
          </div>
        </>
      )}

      <h3>指標</h3>
      <div class="metrics" data-testid="metrics">
        <MetricInput label="PER（実績）" unit="倍" value={pick.metrics.per} onSave={(v) => setMetric('per', v)} i={0} />
        <MetricInput label="PER（予想）" unit="倍" value={pick.metrics.perForecast} onSave={(v) => setMetric('perForecast', v)} i={1} />
        <MetricInput label="PBR" unit="倍" value={pick.metrics.pbr} onSave={(v) => setMetric('pbr', v)} i={2} />
        <MetricInput label="ROE" unit="%" value={pick.metrics.roe} onSave={(v) => setMetric('roe', v)} i={3} />
        <MetricInput
          label="時価総額（億円）"
          value={pick.metrics.marketCap == null ? null : pick.metrics.marketCap / 1e8}
          onSave={(v) => {
            const n = Number(toHalfWidth(v).replace(/[,，]/g, ''));
            update({ metrics: { ...pick.metrics, marketCap: v.trim() === '' || Number.isNaN(n) ? null : n * 1e8 } });
          }}
          display={fmtCap(pick.metrics.marketCap)}
          i={4}
        />
        {!LOCAL_ONLY && (
        <div class="metric" style={{ '--i': 5 }}>
          <label>出来高</label>
          <div class="row">
            <span class="v" data-testid="volume">
              {market?.volume != null ? `${fmt(market.volume / 1000)}` : '—'}
            </span>
            <span class="unit">千株</span>
          </div>
        </div>
        )}
      </div>

      <h3>見出し</h3>
      <AutoField class="field big" value={pick.headline} onSave={(v) => update({ headline: v })} label="見出し" testId="pick-headline" />
      <h3>材料と反応</h3>
      <AutoField class="field" value={pick.reaction} onSave={(v) => update({ reaction: v })} label="材料と反応" testId="pick-reaction" />
      <h3>※ 素直に受け取れない点</h3>
      <div class="caveat" style={{ padding: 4 }}>
        <AutoField class="field" value={pick.caveat} onSave={(v) => update({ caveat: v })} label="素直に受け取れない点" testId="pick-caveat" />
      </div>

      <div class="sheet-actions">
        {!LOCAL_ONLY && (
          <button class={`btn ai press${analyzing ? ' analyzing' : ''}`} onClick={() => void aiFillPick(id)} disabled={analyzing} data-testid="pick-ai">
            <IconSpark /> {analyzing ? '分析中' : 'AIで補完'}
          </button>
        )}
        <a class="btn press" href={`https://kabutan.jp/stock/?code=${pick.code}`} target="_blank" rel="noopener noreferrer">
          株探 <IconExternal />
        </a>
        <button class="btn danger press" onClick={() => deletePick(id)} data-testid="pick-delete">
          <IconTrash /> 削除
        </button>
      </div>

      {related && related.length > 0 && (
        <>
          <h3>関連メモ</h3>
          <div class="related stagger">
            {related.map((r, i) => (
              <div class="card" key={r.id} style={{ '--i': i }}>
                <div class="meta">{r.day}</div>
                <p class="memo-body" style={{ fontSize: 14 }}>
                  {r.body}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

function PriceBlock({ market }: { market: Market | undefined }) {
  const price = useCountUp(market?.price ?? null, 900);
  const up = (market?.change ?? 0) > 0;
  const down = (market?.change ?? 0) < 0;
  return (
    <div class="price-row">
      <span class="price-big price" data-testid="price">
        {price == null ? '—' : fmt(price, price % 1 ? 1 : 0)}
        <small>円</small>
      </span>
      {market?.change != null && (
        <span class={`chg ${up ? 'up' : down ? 'down' : 'flat'}`}>
          {up ? '+' : ''}
          {fmt(market.change, market.change % 1 ? 1 : 0)}（{up ? '+' : ''}
          {market.changePct?.toFixed(2)}%）
        </span>
      )}
    </div>
  );
}

function MetricInput({ label, unit, value, onSave, display, i }: { label: string; unit?: string; value: number | null | undefined; onSave: (v: string) => void; display?: string; i: number }) {
  const [focus, setFocus] = useState(false);
  const shown = focus ? (value ?? '') : display ?? (value == null ? '' : String(value));
  return (
    <div class="metric" style={{ '--i': i }}>
      <label>{label}</label>
      <div class="row">
        <input
          inputMode="decimal"
          value={shown}
          placeholder="—"
          onFocus={() => setFocus(true)}
          onBlur={(e) => {
            setFocus(false);
            const v = (e.target as HTMLInputElement).value;
            if (v !== String(value ?? '')) onSave(v);
          }}
          aria-label={label}
          data-testid={`metric-${label}`}
        />
        {unit && <span class="unit">{unit}</span>}
      </div>
    </div>
  );
}

function AutoField({ value, onSave, label, testId, class: cls }: { value: string; onSave: (v: string) => void; label: string; testId: string; class: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el) el.value = value;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [value]);
  return (
    <textarea
      ref={ref}
      class={cls}
      rows={1}
      aria-label={label}
      data-testid={testId}
      onInput={(e) => {
        const el = e.target as HTMLTextAreaElement;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
      }}
      onBlur={(e) => {
        const v = (e.target as HTMLTextAreaElement).value;
        if (v !== value) onSave(v);
      }}
    />
  );
}

// ---------------- 追加シート ----------------
export function AddPickSheet() {
  const [code, setCode] = useState('');
  const [headline, setHeadline] = useState('');
  const [err, setErr] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setTimeout(() => ref.current?.focus(), 350);
  }, []);
  const submit = (e: Event) => {
    e.preventDefault();
    const c = toHalfWidth(code.trim().toUpperCase());
    if (!isStockCode(c)) return setErr('銘柄コードは4文字（例: 5333、285A）');
    const day = getState().day;
    const dup = Object.values(getState().picks).find((p) => p.code === c && p.day === day && !p.deletedAt);
    const p = dup ?? newPick(c, { headline: headline.trim() });
    setState({ sheet: { kind: 'pick', id: p.id } });
  };
  return (
    <Sheet onClose={() => setState({ sheet: null })} label="銘柄を追加">
      <form class="form" onSubmit={submit}>
        <input
          ref={ref}
          class="input code"
          value={code}
          maxLength={4}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="5333"
          aria-label="銘柄コード"
          data-testid="pick-code"
          onInput={(e) => {
            setCode((e.target as HTMLInputElement).value.toUpperCase());
            setErr('');
          }}
        />
        <input class="input" value={headline} placeholder="見出し" aria-label="見出し" onInput={(e) => setHeadline((e.target as HTMLInputElement).value)} data-testid="pick-new-headline" />
        <div class="err" role="alert">
          {err}
        </div>
        <button class="btn primary block press" data-testid="pick-submit">
          追加
        </button>
      </form>
    </Sheet>
  );
}

export function LoginSheet() {
  return (
    <Sheet onClose={() => setState({ sheet: null })} label="ログイン">
      <div class="form" style={{ padding: '8px 0 4px' }}>
        <h2 class="sheet-title" style={{ fontSize: 22 }}>
          株メモ
        </h2>
        <button class="btn primary block press" onClick={login} data-testid="login-google">
          Googleでログイン
        </button>
      </div>
    </Sheet>
  );
}
