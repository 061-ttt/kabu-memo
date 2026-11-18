import { render } from 'preact';
import { App } from './App';
import { DateNav, UserMenu } from './components/Chrome';
import { enhanceComposer } from './composer';
import { checkAuth } from './data';
import { installSheen } from './motion';
import { toast } from './store';

const $ = (id: string) => document.getElementById(id) as HTMLElement;

// Chromium だけ背景の屈折を有効にする（Safari は url() の backdrop-filter 非対応）
if (/Chrome\//.test(navigator.userAgent) && !/Edg\//.test(navigator.userAgent) && CSS.supports('backdrop-filter', 'url(#x)')) {
  document.documentElement.classList.add('refract');
}

enhanceComposer();

for (const [id, node] of [
  ['app', <App />],
  ['date-slot', <DateNav />],
  ['user-slot', <UserMenu />],
] as const) {
  const el = $(id);
  el.textContent = '';
  render(node, el);
}

installSheen();
void checkAuth();

const err = new URLSearchParams(location.search).get('auth_error');
if (err) {
  toast(err === 'forbidden' ? 'このアカウントは利用できません' : 'ログインできませんでした');
  history.replaceState(null, '', '/');
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => {
    try {
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
    } catch {
      /* 埋め込み表示などで使えない環境 */
    }
  });
}
