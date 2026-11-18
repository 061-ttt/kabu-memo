import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** index.html のインラインスクリプトのハッシュ入りCSPを _headers に書き出す */
function securityHeaders(): Plugin {
  return {
    name: 'km-security-headers',
    apply: 'build',
    writeBundle(opts) {
      const dir = opts.dir!;
      const source = readFileSync(join(dir, 'index.html'), 'utf8');
      const hashes = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
        (m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`,
      );
      const csp = [
        "default-src 'self'",
        `script-src 'self' ${hashes.join(' ')}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https://*.googleusercontent.com",
        "connect-src 'self'",
        "manifest-src 'self'",
        "worker-src 'self'",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
      ].join('; ');
      writeFileSync(
        join(dir, '_headers'),
        [
          '/*',
          `  Content-Security-Policy: ${csp}`,
          '  X-Content-Type-Options: nosniff',
          '  Referrer-Policy: strict-origin-when-cross-origin',
          '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
          '  X-Frame-Options: DENY',
          '/assets/*',
          '  Cache-Control: public, max-age=31536000, immutable',
          '/sw.js',
          '  Cache-Control: no-cache',
          '',
        ].join('\n'),
      );
    },
  };
}

// VITE_LOCAL_ONLY=1 は端末保存版。どこに置いても動くよう相対パスで出力する
const local = process.env.VITE_LOCAL_ONLY === '1';

export default defineConfig({
  root: 'src/client',
  publicDir: 'public',
  base: local ? './' : '/',
  build: { outDir: local ? '../../dist-local' : '../../dist', emptyOutDir: true, target: 'es2022', modulePreload: { polyfill: false } },
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  plugins: [securityHeaders()],
});
