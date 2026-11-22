// Runs the optional server on this computer, for personal use: no Cloudflare
// account, nothing deployed. It is the same code as the deployed Worker, with
// storage kept in a file on this machine and the real Gemini API behind it.
//
//   npm run local          (from the project root: starts this and the app)
//
// The Gemini key is read, in this order, from: the GEMINI_API_KEY environment
// variable, worker/.dev.vars, or gemini.env in your home folder. It stays in
// this process: it is never printed, logged, or sent to the app.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.WJ_LOCAL_PORT || 8787);
const ORIGINS = process.env.WJ_LOCAL_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173';
// Outside the project on purpose, so it is never committed or synced to a cloud folder with it.
const DATA_FILE = process.env.WJ_LOCAL_DATA || join(homedir(), '.weather-journal-local', 'kv.json');
const KEY_FILES = [join(here, '..', '.dev.vars'), join(homedir(), 'gemini.env')];

function readKey() {
  if (process.env.GEMINI_API_KEY?.trim()) return process.env.GEMINI_API_KEY.trim();
  for (const file of KEY_FILES) {
    if (!existsSync(file)) continue;
    const line = readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .find((l) => /^\s*GEMINI_API_KEY\s*=/.test(l));
    const value = (line || '').replace(/^\s*GEMINI_API_KEY\s*=\s*/, '').trim().replace(/^["']|["']$/g, '');
    if (value) return value;
  }
  return '';
}

// A key-value store with the parts of Workers KV the server uses, kept in one
// JSON file so sync and the helpers keep working after a restart.
function fileKv(path) {
  let data = {};
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    // first run, or an unreadable file: start empty
  }
  let timer = null;
  const write = () => {
    clearTimeout(timer);
    timer = null;
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, path);
  };
  // Written straight away: the process can be stopped at any moment (Ctrl+C,
  // closing the window), and the file is small and changes rarely.
  const save = write;
  const live = (key) => {
    const entry = data[key];
    if (!entry) return null;
    if (entry.expires && entry.expires < Date.now()) {
      delete data[key];
      return null;
    }
    return entry;
  };
  return {
    async get(key, type) {
      const entry = live(key);
      if (!entry) return null;
      return type === 'json' ? JSON.parse(entry.value) : entry.value;
    },
    async put(key, value, options = {}) {
      data[key] = { value: String(value), expires: options.expirationTtl ? Date.now() + options.expirationTtl * 1000 : 0 };
      save();
    },
    async delete(key) {
      delete data[key];
      save();
    },
    async list({ prefix = '' } = {}) {
      return { keys: Object.keys(data).filter((k) => k.startsWith(prefix) && live(k)).map((name) => ({ name })), list_complete: true };
    },
    flush: () => timer && write(),
  };
}

let handle;
try {
  ({ handle } = await import(pathToFileURL(join(here, '..', 'src', 'index.js')).href));
} catch (error) {
  console.error("Couldn't load the server code:", error?.message || error);
  console.error('If a package is missing, run:  npm install --prefix worker');
  process.exit(1);
}

const key = readKey();
const kv = fileKv(DATA_FILE);
const env = { JOURNAL: kv, ALLOWED_ORIGINS: ORIGINS, ...(key ? { GEMINI_API_KEY: key } : {}) };

const server = createServer(async (nodeReq, nodeRes) => {
  const chunks = [];
  for await (const chunk of nodeReq) chunks.push(chunk);
  const headers = new Headers();
  for (const [name, value] of Object.entries(nodeReq.headers)) if (typeof value === 'string') headers.set(name, value);
  const request = new Request(`http://localhost:${PORT}${nodeReq.url}`, {
    method: nodeReq.method,
    headers,
    body: ['GET', 'HEAD'].includes(nodeReq.method) ? undefined : Buffer.concat(chunks),
  });
  try {
    const response = await handle(request, env, {});
    const out = {};
    response.headers.forEach((value, name) => (out[name] = value));
    nodeRes.writeHead(response.status, out);
    nodeRes.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error('server error:', String(error?.name || 'error'));
    nodeRes.writeHead(500);
    nodeRes.end();
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    kv.flush();
    process.exit(0);
  });
}
process.on('exit', () => kv.flush());

server.listen(PORT, () => {
  console.log(`Weather Journal local server: http://localhost:${PORT}`);
  console.log(key ? `Gemini key: found (never shown). The AI helpers are on.` : 'Gemini key: NOT FOUND. The AI helpers will say they are not set up.');
  if (!key) console.log(`  Put GEMINI_API_KEY=... in one of: ${KEY_FILES.join('  or  ')}`);
  console.log(`Data file: ${DATA_FILE}`);
});
