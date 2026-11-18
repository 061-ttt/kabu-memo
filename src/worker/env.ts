import type { User } from '../shared/types';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AI?: Ai;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  /** カンマ区切り。設定時はこのメールアドレスだけログイン可 */
  ALLOWED_EMAILS?: string;
  AI_MODEL?: string;
  AI_DAILY_LIMIT?: string;
  /** テスト専用: "mock" で Workers AI を呼ばずに決定的な応答を返す */
  AI_MODE?: string;
  /** テスト専用: "mock" で外部の株価APIを呼ばない */
  MARKET_MODE?: string;
  /** テスト専用: OAuth エンドポイントの差し替え（未設定なら Google） */
  GOOGLE_AUTH_URL?: string;
  GOOGLE_TOKEN_URL?: string;
  GOOGLE_USERINFO_URL?: string;
}

export type AppEnv = { Bindings: Env; Variables: { user: User } };
