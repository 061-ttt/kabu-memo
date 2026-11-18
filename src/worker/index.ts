import { Hono } from 'hono';
import { api } from './api';
import { authRoutes, requireUser, sameOrigin } from './auth';
import type { AppEnv } from './env';

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  await next();
  c.header('x-content-type-options', 'nosniff');
  c.header('referrer-policy', 'strict-origin-when-cross-origin');
  if (!c.res.headers.has('cache-control')) c.header('cache-control', 'no-store');
});

app.use('/auth/logout', sameOrigin);
app.route('/auth', authRoutes);

app.use('/api/*', sameOrigin, requireUser);
app.route('/api', api);

app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));
app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal' }, 500);
});

export default app;
