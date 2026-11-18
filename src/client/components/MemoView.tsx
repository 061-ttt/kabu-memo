import { useRef } from 'preact/hooks';
import type { AnalysisItem, Memo } from '../../shared/types';
import { addTask, analyzeMemo, deleteMemo, pickFromAnalysis } from '../data';
import { useFlip } from '../motion';
import { setState, toast, useStore } from '../store';
import { ScreenSkeleton } from './Skeleton';
import { Swipe } from './Swipe';
import { IconFlame, IconPlus, IconSnow, IconSpark, IconTick, IconTrash } from './icons';

const hhmm = (t: number) => new Date(t + 9 * 3600e3).toISOString().slice(11, 16);

export function MarkBadge({ mark }: { mark: 'strong' | 'weak' | null }) {
  if (!mark) return null;
  return mark === 'strong' ? (
    <span class="mark strong" data-testid="mark-strong">
      <IconFlame />強
    </span>
  ) : (
    <span class="mark weak" data-testid="mark-weak">
      <IconSnow />弱
    </span>
  );
}

export function MemoView({ loading }: { loading: boolean }) {
  const day = useStore((s) => s.day);
  const memosMap = useStore((s) => s.memos);
  const dir = useStore((s) => s.dir);
  const list = Object.values(memosMap)
    .filter((m) => m.day === day && !m.deletedAt)
    .sort((a, b) => b.createdAt - a.createdAt);
  const box = useRef<HTMLDivElement>(null);
  useFlip(box, [list.map((m) => m.id).join()]);

  if (loading && !list.length) return <ScreenSkeleton variant="memo" />;
  return (
    <div class={`view enter-${dir}`} key={day} ref={box} data-testid="memo-view">
      <div class="section-head">
        <h2>メモ</h2>
        <span class="count" data-testid="memo-count">
          {list.length}件
        </span>
      </div>
      <div class="view stagger">
        {list.map((m, i) => (
          <MemoCard key={m.id} memo={m} index={i} />
        ))}
      </div>
    </div>
  );
}

function MemoCard({ memo, index }: { memo: Memo; index: number }) {
  const analyzing = useStore((s) => !!s.analyzing[memo.id]);
  return (
    <div style={{ '--i': Math.min(index, 8) }} data-flip={memo.id}>
      <Swipe
        testId="memo-card"
        right={{
          label: (
            <>
              <IconSpark size={18} /> AI分析
            </>
          ),
          color: 'linear-gradient(120deg,#7c3aed,#0ea5e9)',
          run: () => void analyzeMemo(memo.id),
        }}
        left={{
          label: (
            <>
              削除 <IconTrash />
            </>
          ),
          color: '#ef4444',
          run: () => deleteMemo(memo.id),
        }}
      >
        <article class={`card glass${analyzing ? ' analyzing' : ''}`} data-id={memo.id}>
          <div class="meta">
            <span class="num">{hhmm(memo.createdAt)}</span>
            {memo.codes.map((c) => (
              <span class="chip muted" key={c}>
                {c}
              </span>
            ))}
          </div>
          <p class="memo-body">{memo.body}</p>
          {analyzing ? (
            <div class="ai-wait" data-testid="ai-wait">
              <i class="sk w60" />
              <i class="sk w90" />
              <i class="sk w80" />
            </div>
          ) : memo.analysis ? (
            <AnalysisView memo={memo} />
          ) : (
            <div class="card-actions">
              <button class="pill-btn ai press" onClick={() => void analyzeMemo(memo.id)} data-testid="analyze">
                <IconSpark size={14} /> AI分析
              </button>
            </div>
          )}
        </article>
      </Swipe>
    </div>
  );
}

function AnalysisView({ memo }: { memo: Memo }) {
  const picks = useStore((s) => s.picks);
  const tasks = useStore((s) => s.tasks);
  const a = memo.analysis!;
  const hasPick = (code: string) => Object.values(picks).some((p) => p.code === code && p.day === memo.day && !p.deletedAt);
  const hasTask = (title: string) => Object.values(tasks).some((t) => t.title === title && !t.deletedAt);
  return (
    <div class="analysis" data-testid="analysis">
      {a.items.map((it, i) => (
        <AnalysisItemView key={i} item={it} index={i} added={!!it.code && hasPick(it.code)} day={memo.day} />
      ))}
      {a.tasks.length > 0 && (
        <div class="an-item" style={{ '--i': a.items.length }}>
          <div class="label" style={{ marginTop: 0 }}>
            次にやること
          </div>
          <div class="task-sugs">
            {a.tasks.map((t) => {
              const done = hasTask(t);
              return (
                <button
                  key={t}
                  class={`pill-btn press${done ? ' done' : ''}`}
                  disabled={done}
                  data-testid="suggested-task"
                  onClick={() => {
                    addTask(t, a.items.length === 1 && a.items[0].code ? a.items[0].code : null);
                    toast('タスクに追加');
                  }}
                >
                  {done ? <IconTick size={14} /> : <IconPlus size={14} />} {t}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AnalysisItemView({ item, index, added, day }: { item: AnalysisItem; index: number; added: boolean; day: string }) {
  return (
    <div class="an-item" style={{ '--i': index }} data-testid="analysis-item">
      <div class="an-head">
        <span class="an-name">{item.name || item.code}</span>
        {item.code && <span class="code">{item.code}</span>}
        <MarkBadge mark={item.mark} />
        {item.theme && <span class="theme">{item.theme}</span>}
      </div>
      {item.headline && <p class="headline">{item.headline}</p>}
      <div class="label">材料と反応</div>
      <div data-testid="reaction">{item.reaction}</div>
      <div class="caveat">
        <div class="label">※ 素直に受け取れない点</div>
        <div data-testid="caveat">{item.caveat}</div>
      </div>
      {item.code && (
        <div class="card-actions">
          <button
            class={`pill-btn press${added ? ' done' : ''}`}
            disabled={added}
            data-testid="to-note"
            onClick={() => {
              const p = pickFromAnalysis(item, day);
              if (p) toast('銘柄ノートに追加', { label: '開く', run: () => setState({ tab: 'pick', dir: 'r', sheet: { kind: 'pick', id: p.id }, toast: null }) });
            }}
          >
            {added ? <IconTick size={14} /> : <IconPlus size={14} />} {added ? 'ノート追加済み' : 'ノートへ'}
          </button>
        </div>
      )}
    </div>
  );
}
