import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { nextStatus, prevStatus, TASK_FLOW, TASK_LABEL, type Task, type TaskStatus } from '../../shared/types';
import { addTask, deleteTask, setTaskStatus } from '../data';
import { useFlip } from '../motion';
import { setState, useStore } from '../store';
import { ScreenSkeleton } from './Skeleton';
import { Swipe, type SwipeAction } from './Swipe';
import { IconPlus, IconTick, IconTrash, IconUndo, IconArrowRight } from './icons';

const COLORS: Record<TaskStatus, string> = { todo: '#94a3b8', doing: '#f59e0b', done: '#10b981' };
const FILTERS = [
  { id: 'active', label: '進行中・未着手' },
  { id: 'done', label: '完了' },
  { id: 'all', label: 'すべて' },
] as const;

export function TaskView({ loading }: { loading: boolean }) {
  const tasksMap = useStore((s) => s.tasks);
  const filter = useStore((s) => s.taskFilter);
  const dir = useStore((s) => s.dir);
  const [title, setTitle] = useState('');
  const all = Object.values(tasksMap).filter((t) => !t.deletedAt);
  const rank: Record<TaskStatus, number> = { doing: 0, todo: 1, done: 2 };
  const list = all
    .filter((t) => (filter === 'all' ? true : filter === 'done' ? t.status === 'done' : t.status !== 'done'))
    .sort((a, b) => rank[a.status] - rank[b.status] || b.createdAt - a.createdAt);
  const counts = Object.fromEntries(TASK_FLOW.map((s) => [s, all.filter((t) => t.status === s).length])) as Record<TaskStatus, number>;
  const box = useRef<HTMLDivElement>(null);
  useFlip(box, [list.map((t) => `${t.id}${t.status}`).join()]);

  const seg = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState({ left: 4, width: 0 });
  useLayoutEffect(() => {
    const b = seg.current?.querySelector<HTMLElement>(`[data-f="${filter}"]`);
    if (b) setInd({ left: b.offsetLeft, width: b.offsetWidth });
  }, [filter, counts.done, counts.doing, counts.todo]);

  if (loading && !all.length) return <ScreenSkeleton variant="task" />;

  const submit = (e: Event) => {
    e.preventDefault();
    if (!title.trim()) return;
    addTask(title);
    setTitle('');
    if (filter === 'done') setState({ taskFilter: 'active' });
  };

  return (
    <div class={`view enter-${dir}`} data-testid="task-view">
      <form class="task-add glass" onSubmit={submit}>
        <input value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} placeholder="タスク" aria-label="タスク" maxLength={200} data-testid="task-input" />
        <button class="send press" aria-label="追加" data-testid="task-add">
          <IconPlus />
        </button>
      </form>
      <div class="seg glass" ref={seg} role="group" aria-label="表示">
        <div class="seg-ind" style={{ left: `${ind.left}px`, width: `${ind.width}px` }} />
        {FILTERS.map((f) => (
          <button key={f.id} data-f={f.id} aria-pressed={filter === f.id} onClick={() => setState({ taskFilter: f.id })} data-testid={`task-filter-${f.id}`}>
            {f.label}
            <span class="count" style={{ marginLeft: 4 }}>
              {f.id === 'active' ? counts.todo + counts.doing : f.id === 'done' ? counts.done : all.length}
            </span>
          </button>
        ))}
      </div>
      <div class="view stagger" ref={box}>
        {list.map((t, i) => (
          <TaskRow key={t.id} task={t} index={i} />
        ))}
        {!list.length && <p class="empty">0件</p>}
      </div>
    </div>
  );
}

function TaskRow({ task, index }: { task: Task; index: number }) {
  const next = nextStatus(task.status);
  const prev = prevStatus(task.status);
  const right: SwipeAction | null = next
    ? {
        label: (
          <>
            {next === 'done' ? <IconTick size={18} /> : <IconArrowRight />} {TASK_LABEL[next]}
          </>
        ),
        color: COLORS[next],
        run: () => setTaskStatus(task.id, next),
      }
    : null;
  const left: SwipeAction = prev
    ? {
        label: (
          <>
            {TASK_LABEL[prev]} <IconUndo />
          </>
        ),
        color: COLORS[prev],
        run: () => setTaskStatus(task.id, prev),
      }
    : {
        label: (
          <>
            削除 <IconTrash />
          </>
        ),
        color: '#ef4444',
        run: () => deleteTask(task.id),
      };
  const cycle = () => setTaskStatus(task.id, next ?? 'todo');
  return (
    <div data-flip={task.id} style={{ '--i': Math.min(index, 8) }}>
      <Swipe testId="task" right={right} left={left}>
        <div class={`card glass task ${task.status}`} data-status={task.status} data-title={task.title}>
          <button class={`status-dot press ${task.status}`} onClick={cycle} aria-label={`状態: ${TASK_LABEL[task.status]}（タップで次へ）`} data-testid="task-status">
            {task.status === 'done' && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            )}
          </button>
          <span class="task-title">{task.title}</span>
          {task.code && <span class="code">{task.code}</span>}
          <span class={`status-label ${task.status}`} key={task.status} style={{ animation: 'pop .4s var(--spring)' }}>
            {TASK_LABEL[task.status]}
          </span>
        </div>
      </Swipe>
    </div>
  );
}
