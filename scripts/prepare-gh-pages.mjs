import { rename, copyFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = join(import.meta.dirname, '..', 'dist');
const spaHtml = join(DIST, 'spa.html');
const indexHtml = join(DIST, 'index.html');
const notFoundHtml = join(DIST, '404.html');

try {
  await access(spaHtml);
} catch {
  console.error('dist/spa.html not found — run npm run build:spa first');
  process.exit(1);
}

await rename(spaHtml, indexHtml);
await copyFile(indexHtml, notFoundHtml);

console.log('GitHub Pages ready:');
console.log('  spa.html → index.html');
console.log('  index.html → 404.html (SPA fallback)');
