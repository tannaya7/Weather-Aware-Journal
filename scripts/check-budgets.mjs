// Fails the build if the app got heavier than its budgets (perf-budgets.json).
// Sizes are gzipped, as browsers download them. Run after `vite build`:
//   npm run check:budgets
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dist = join(root, 'dist');
const budgets = JSON.parse(readFileSync(join(root, 'perf-budgets.json'), 'utf8'));

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const assets = files(join(dist, 'assets')).map((path) => {
  const name = path.split(/[\\/]/).pop();
  const raw = readFileSync(path);
  return { name, raw: raw.length, gzip: gzipSync(raw, { level: 9 }).length };
});

// "index-AbC123.js" -> "index"
const chunkName = (name) => name.replace(/-[\w-]{8}\.(js|css|wasm)$/, '');
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const initial = assets.filter((a) => /\.(js|css)$/.test(a.name) && html.includes(a.name));

const rows = [];
const failures = [];
function check(label, size, limitKb) {
  const ok = size <= limitKb * 1024;
  rows.push(`${ok ? 'ok  ' : 'OVER'}  ${label.padEnd(44)} ${kb(size).padStart(10)}  / ${limitKb} KB`);
  if (!ok) failures.push(label);
}

check('first load: JavaScript', initial.filter((a) => a.name.endsWith('.js')).reduce((n, a) => n + a.gzip, 0), budgets.initialJsKb);
check('first load: CSS', initial.filter((a) => a.name.endsWith('.css')).reduce((n, a) => n + a.gzip, 0), budgets.initialCssKb);

for (const asset of assets.filter((a) => a.name.endsWith('.js') && !initial.includes(a))) {
  const name = chunkName(asset.name);
  const limit = budgets.chunkKb[name] ?? budgets.defaultChunkKb;
  check(`page/chunk: ${name}`, asset.gzip, limit);
}

// What the service worker downloads when the app is installed.
const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
const precached = assets.filter((a) => sw.includes(a.name));
check('offline install (precache)', precached.reduce((n, a) => n + a.gzip, 0), budgets.precacheKb);

console.log(rows.join('\n'));
if (failures.length) {
  console.error(`\nOver budget: ${failures.join(', ')}. Make it smaller, or raise the budget in perf-budgets.json on purpose.`);
  process.exit(1);
}
console.log('\nAll within budget.');
