// Cloudflare Pages: the build writes dist/spa.html; Pages needs index.html.
// No 404.html on purpose — without one, Cloudflare treats the site as a
// single-page app and serves index.html for every address, so deep links work.
import { access, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = join(import.meta.dirname, '..', 'dist');
const spaHtml = join(DIST, 'spa.html');

try {
  await access(spaHtml);
} catch {
  console.error('dist/spa.html not found — run the SPA build first');
  process.exit(1);
}

await rename(spaHtml, join(DIST, 'index.html'));
await rm(join(DIST, '404.html'), { force: true });
console.log('Cloudflare Pages ready: spa.html → index.html (single-page app mode)');
