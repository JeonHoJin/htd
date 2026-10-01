import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// 빌드 결과물에만 CSP를 넣는다 (dev 서버는 HMR용 인라인 스타일을 쓰기 때문)
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function csp(): Plugin {
  return {
    name: 'htd-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  };
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** 빌드 산출물 전체를 프리캐시하는 service worker를 생성한다. */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'htd-sw',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    writeBundle() {
      const files = walk(outDir)
        .map((p) => relative(outDir, p).split('\\').join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map'))
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const assets = JSON.stringify(['./', ...files]);
      const template = readFileSync('src/sw-template.js', 'utf8');
      writeFileSync(join(outDir, 'sw.js'), template.replace('__VERSION__', version).replace('__ASSETS__', assets));
    },
  };
}

export default defineConfig({
  base: '/htd/',
  plugins: [csp(), serviceWorker()],
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 1500 },
  test: { include: ['tests/**/*.test.ts'] },
});
