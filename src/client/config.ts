/**
 * 端末保存版（VITE_LOCAL_ONLY=1 でビルド）。
 * サーバー（Cloudflare）を使わず、メモ・銘柄ノート・タスクを端末だけに保存する。
 * ログイン・AI分析・株価・同期は使わない。
 */
export const LOCAL_ONLY = import.meta.env.VITE_LOCAL_ONLY === '1';
