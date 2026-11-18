-- 相場帖：日ごとの話題株・日ごとのメモ・株価キャッシュ
-- 以前の memos / tasks / picks は消さずに残す（このマイグレーションは追加のみ）

CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  -- 端末の時計（どちらの更新を採るかの判定に使う）
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  -- サーバーの時計（差分同期のカーソルに使う）
  server_at INTEGER NOT NULL
);
CREATE INDEX idx_entries_user_server ON entries(user_id, server_at);

CREATE TABLE day_notes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  server_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
CREATE INDEX idx_day_notes_user_server ON day_notes(user_id, server_at);

-- J-Quants の日足（全ユーザー共通）。o〜v は分割調整済み、rc は調整前の終値
CREATE TABLE bars (
  code TEXT NOT NULL,
  day TEXT NOT NULL,
  o REAL NOT NULL,
  h REAL NOT NULL,
  l REAL NOT NULL,
  c REAL NOT NULL,
  v REAL NOT NULL,
  rc REAL NOT NULL,
  PRIMARY KEY (code, day)
);

CREATE TABLE valuations (
  code TEXT NOT NULL,
  day TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (code, day)
);

CREATE TABLE issues (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  market TEXT NOT NULL DEFAULT '',
  sector TEXT NOT NULL DEFAULT '',
  fetched_at INTEGER NOT NULL
);

-- 同じ取得を短時間に繰り返さないための記録
CREATE TABLE market_fetch (
  key TEXT PRIMARY KEY,
  fetched_at INTEGER NOT NULL,
  status INTEGER NOT NULL
);
