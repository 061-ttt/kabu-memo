import { useEffect } from 'preact/hooks';
import { pullMemos, pullPicks, pullTasks } from './data';
import { TabBar, ToastView } from './components/Chrome';
import { MemoView } from './components/MemoView';
import { AddPickSheet, LoginSheet, PickSheet, PickView } from './components/PickView';
import { TaskView } from './components/TaskView';
import { useStore } from './store';

export function App() {
  const tab = useStore((s) => s.tab);
  const day = useStore((s) => s.day);
  const userId = useStore((s) => s.user?.id ?? null);
  const authChecked = useStore((s) => s.authChecked);
  const loaded = useStore((s) => s.loaded);
  const sheet = useStore((s) => s.sheet);
  const memos = useStore((s) => s.memos);
  const picks = useStore((s) => s.picks);
  const tasks = useStore((s) => s.tasks);

  // 表示中の画面を最優先で取得し、残りは裏で取得する
  useEffect(() => {
    if (!userId) return;
    const first = tab === 'memo' ? pullMemos(day) : tab === 'pick' ? pullPicks(day) : pullTasks();
    void first.then(() => Promise.all([pullMemos(day), pullPicks(day), pullTasks()]));
  }, [tab, day, userId]);

  useEffect(() => {
    if (!userId) return;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      void pullMemos(day);
      void pullPicks(day);
      void pullTasks();
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [day, userId]);

  const waiting = (key: string) => !loaded[key] && (!!userId || !authChecked);
  const counts = {
    memo: Object.values(memos).filter((m) => m.day === day && !m.deletedAt).length,
    pick: Object.values(picks).filter((p) => p.day === day && !p.deletedAt).length,
    task: Object.values(tasks).filter((t) => !t.deletedAt && t.status !== 'done').length,
  };

  return (
    <>
      {tab === 'memo' && <MemoView loading={waiting(`memo:${day}`)} />}
      {tab === 'pick' && <PickView loading={waiting(`pick:${day}`)} />}
      {tab === 'task' && <TaskView loading={waiting('task')} />}
      <TabBar counts={counts} />
      <ToastView />
      {sheet?.kind === 'pick' && <PickSheet key={sheet.id} id={sheet.id} />}
      {sheet?.kind === 'addPick' && <AddPickSheet />}
      {sheet?.kind === 'login' && <LoginSheet />}
    </>
  );
}
