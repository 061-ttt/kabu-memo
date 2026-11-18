// E2E用の模擬 Google OAuth / OIDC サーバー。
// 本物と同じく state はそのまま返し、PKCE(S256) と client_secret を検証する。
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_GOOGLE_PORT || 8790);
const CLIENT_ID = 'e2e-client';
const CLIENT_SECRET = 'e2e-secret';

const DEFAULT = { sub: 'google-user-a', email: 'a@example.com', name: 'Aさん', email_verified: true };
let nextIdentity = { ...DEFAULT };
const codes = new Map(); // code -> { challenge, redirectUri, identity }
const tokens = new Map(); // access_token -> identity
const stats = { authorize: 0, token: 0, pkceOk: 0, userinfo: 0 };

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const readBody = (req) =>
  new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const json = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  if (url.pathname === '/__next' && req.method === 'POST') {
    nextIdentity = { ...DEFAULT, ...JSON.parse((await readBody(req)) || '{}') };
    return json(200, nextIdentity);
  }
  if (url.pathname === '/__stats') return json(200, stats);
  if (url.pathname === '/health') return json(200, { ok: true });

  if (url.pathname === '/authorize') {
    stats.authorize++;
    const q = url.searchParams;
    if (q.get('client_id') !== CLIENT_ID) return json(400, { error: 'invalid_client' });
    if (q.get('response_type') !== 'code') return json(400, { error: 'unsupported_response_type' });
    if (q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge')) return json(400, { error: 'pkce_required' });
    if (!q.get('state')) return json(400, { error: 'state_required' });
    if (!(q.get('scope') || '').split(' ').includes('openid')) return json(400, { error: 'invalid_scope' });
    const code = b64url(randomBytes(24));
    codes.set(code, { challenge: q.get('code_challenge'), redirectUri: q.get('redirect_uri'), identity: nextIdentity });
    nextIdentity = { ...DEFAULT };
    const back = new URL(q.get('redirect_uri'));
    back.searchParams.set('code', code);
    back.searchParams.set('state', q.get('state'));
    res.writeHead(302, { location: back.toString() });
    return res.end();
  }

  if (url.pathname === '/token' && req.method === 'POST') {
    stats.token++;
    const f = new URLSearchParams(await readBody(req));
    if (f.get('client_id') !== CLIENT_ID || f.get('client_secret') !== CLIENT_SECRET) return json(401, { error: 'invalid_client' });
    if (f.get('grant_type') !== 'authorization_code') return json(400, { error: 'unsupported_grant_type' });
    const entry = codes.get(f.get('code'));
    codes.delete(f.get('code')); // 認可コードは1回限り
    if (!entry) return json(400, { error: 'invalid_grant' });
    if (entry.redirectUri !== f.get('redirect_uri')) return json(400, { error: 'redirect_uri_mismatch' });
    const challenge = b64url(createHash('sha256').update(f.get('code_verifier') || '').digest());
    if (challenge !== entry.challenge) return json(400, { error: 'invalid_grant', detail: 'pkce' });
    stats.pkceOk++;
    const access = b64url(randomBytes(24));
    tokens.set(access, entry.identity);
    return json(200, { access_token: access, token_type: 'Bearer', expires_in: 3599, id_token: 'unused', scope: 'openid email profile' });
  }

  if (url.pathname === '/userinfo') {
    stats.userinfo++;
    const id = tokens.get((req.headers.authorization || '').replace(/^Bearer /, ''));
    if (!id) return json(401, { error: 'invalid_token' });
    return json(200, { ...id, picture: null });
  }

  json(404, { error: 'not_found' });
}).listen(PORT, '127.0.0.1', () => console.log(`mock google on ${PORT}`));
