import { Hono, type MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { User } from '../shared/types';
import type { AppEnv, Env } from './env';
import { codeChallenge, randomToken, safeEqual, sha256Hex, signValue, verifyValue } from './crypto';

export const SESSION_COOKIE = 'km_session';
const OAUTH_COOKIE = 'km_oauth';
const SESSION_TTL = 30 * 24 * 60 * 60; // 秒
const OAUTH_TTL = 10 * 60;

const GOOGLE = {
  auth: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  userinfo: 'https://openidconnect.googleapis.com/v1/userinfo',
};

interface OAuthState {
  state: string;
  verifier: string;
  next: string;
  exp: number;
}

function isHttps(url: string): boolean {
  return new URL(url).protocol === 'https:';
}

/** 外部へのオープンリダイレクトを防ぐ: 同一オリジンの相対パスのみ許可 */
export function safeNext(next: string | undefined | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}

function endpoints(env: Env) {
  return {
    auth: env.GOOGLE_AUTH_URL || GOOGLE.auth,
    token: env.GOOGLE_TOKEN_URL || GOOGLE.token,
    userinfo: env.GOOGLE_USERINFO_URL || GOOGLE.userinfo,
  };
}

export const authRoutes = new Hono<AppEnv>();

authRoutes.get('/login', async (c) => {
  const env = c.env;
  if (!env.GOOGLE_CLIENT_ID || !env.SESSION_SECRET) return c.text('auth not configured', 500);
  const origin = new URL(c.req.url).origin;
  const state = randomToken(24);
  const verifier = randomToken(48);
  const value: OAuthState = { state, verifier, next: safeNext(c.req.query('next')), exp: Date.now() + OAUTH_TTL * 1000 };
  setCookie(c, OAUTH_COOKIE, await signValue(value, env.SESSION_SECRET), {
    httpOnly: true,
    secure: isHttps(c.req.url),
    sameSite: 'Lax',
    path: '/auth',
    maxAge: OAUTH_TTL,
  });
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/auth/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: await codeChallenge(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return c.redirect(`${endpoints(env).auth}?${params}`, 302);
});

authRoutes.get('/callback', async (c) => {
  const env = c.env;
  const fail = (reason: string) => {
    deleteCookie(c, OAUTH_COOKIE, { path: '/auth' });
    return c.redirect(`/?auth_error=${encodeURIComponent(reason)}`, 302);
  };
  const saved = await verifyValue<OAuthState>(getCookie(c, OAUTH_COOKIE), env.SESSION_SECRET);
  const state = c.req.query('state') ?? '';
  const code = c.req.query('code');
  if (c.req.query('error')) return fail('denied');
  if (!saved || saved.exp < Date.now()) return fail('expired');
  if (!code || !safeEqual(state, saved.state)) return fail('state');

  const ep = endpoints(env);
  const origin = new URL(c.req.url).origin;
  const tokenRes = await fetch(ep.token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${origin}/auth/callback`,
      grant_type: 'authorization_code',
      code_verifier: saved.verifier,
    }),
  });
  if (!tokenRes.ok) return fail('token');
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) return fail('token');

  const infoRes = await fetch(ep.userinfo, { headers: { authorization: `Bearer ${token.access_token}` } });
  if (!infoRes.ok) return fail('userinfo');
  const info = (await infoRes.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
  if (!info.sub || !info.email || info.email_verified !== true) return fail('email');

  const allowed = (env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length && !allowed.includes(info.email.toLowerCase())) return fail('forbidden');

  const now = Date.now();
  const user = await env.DB.prepare(
    `INSERT INTO users (id, google_sub, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture
     RETURNING id`,
  )
    .bind(crypto.randomUUID(), info.sub, info.email, info.name ?? '', info.picture ?? null, now)
    .first<{ id: string }>();
  if (!user) return fail('db');

  const sessionToken = randomToken(32);
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(sessionToken), user.id, now + SESSION_TTL * 1000, now)
    .run();
  // 期限切れセッションの掃除（失敗しても致命的ではない）
  c.executionCtx.waitUntil(env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run().catch(() => undefined));

  deleteCookie(c, OAUTH_COOKIE, { path: '/auth' });
  setCookie(c, SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: isHttps(c.req.url),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL,
  });
  return c.redirect(saved.next, 302);
});

authRoutes.post('/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.body(null, 204);
});

export async function findUser(env: Env, token: string | undefined): Promise<User | null> {
  if (!token || token.length > 128) return null;
  const id = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.picture, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ?`,
  )
    .bind(id, Date.now())
    .first<{ id: string; email: string; name: string; picture: string | null; expires_at: number }>();
  if (!row) return null;
  // 残り半分を切ったら延長（スライディング有効期限）
  if (row.expires_at - Date.now() < (SESSION_TTL * 1000) / 2) {
    await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').bind(Date.now() + SESSION_TTL * 1000, id).run();
  }
  return { id: row.id, email: row.email, name: row.name, picture: row.picture };
}

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await findUser(c.env, getCookie(c, SESSION_COOKIE));
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  c.set('user', user);
  await next();
};

/** 変更系リクエストは同一オリジンからのみ受け付ける（CSRF対策） */
export const sameOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next();
  const self = new URL(c.req.url).origin;
  const origin = c.req.header('origin');
  const site = c.req.header('sec-fetch-site');
  const ok = origin ? origin === self : site === 'same-origin';
  if (!ok) return c.json({ error: 'forbidden' }, 403);
  await next();
};
