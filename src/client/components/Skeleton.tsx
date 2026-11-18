const widths = [
  ['w40', 'w90', 'w70'],
  ['w30', 'w80', 'w60'],
  ['w50', 'w90', 'w40'],
  ['w40', 'w70', 'w80'],
  ['w30', 'w90', 'w50'],
  ['w50', 'w60', 'w70'],
];

/** 画面全体を覆うスケルトン。実際のレイアウトと同じ形にする */
export function ScreenSkeleton({ variant }: { variant: 'memo' | 'pick' | 'task' }) {
  return (
    <div class="view skel-screen" data-testid="skeleton" aria-busy="true" aria-label="読み込み中">
      {variant === 'pick' && (
        <div class="toolbar">
          <i class="sk h40" style={{ flex: 1, borderRadius: 999 }} />
          <i class="sk h40" style={{ width: 92, borderRadius: 999 }} />
        </div>
      )}
      {variant === 'task' && <i class="sk h40" style={{ borderRadius: 999 }} />}
      {widths.map((w, i) =>
        variant === 'task' ? (
          <div class="skel-card" key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <i class="sk" style={{ width: 30, height: 30, borderRadius: 15, flex: 'none' }} />
            <i class={`sk ${w[1]}`} />
          </div>
        ) : variant === 'pick' ? (
          <div class="skel-card" key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <i class="sk h20 w40" />
              <i class="sk h20" style={{ width: 70 }} />
            </div>
            <i class={`sk ${w[1]}`} />
          </div>
        ) : (
          <div class="skel-card" key={i}>
            <i class={`sk ${w[0]}`} />
            <i class={`sk ${w[1]}`} />
            <i class={`sk ${w[2]}`} />
          </div>
        ),
      )}
    </div>
  );
}

export function SheetSkeleton() {
  return (
    <div data-testid="sheet-skeleton" aria-busy="true">
      <i class="sk h40 w50" />
      <i class="sk h20 w30" style={{ marginTop: 12 }} />
      <i class="sk chart" style={{ marginTop: 14 }} />
      <div class="metrics" style={{ marginTop: 12 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <i key={i} class="sk h40" />
        ))}
      </div>
    </div>
  );
}
