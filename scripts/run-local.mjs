// One command to use Weather Journal, with its optional server, on this computer:
//
//   npm run local
//
// Starts the local server (worker/scripts/local-server.mjs) and the app, and
// opens the app in your browser. Press Ctrl+C to stop both. Nothing is deployed
// and nothing leaves this machine except calls the app makes itself (weather
// lookups, maps) and the Gemini requests you start with a button press.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const SERVER_URL = `http://localhost:${process.env.WJ_LOCAL_PORT || 8787}`;
const windows = process.platform === 'win32';
const children = [];
let stopping = false;

function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (windows) spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 300);
}

// Both programs are started directly with Node, with no shell in between, so
// paths with spaces (such as "C:\Program Files") work.
function run(name, script, args = [], env = {}) {
  if (!existsSync(script)) {
    console.error(`Can't find ${script}. Run "npm install" first.`);
    process.exit(1);
  }
  const child = spawn(process.execPath, [script, ...args], { stdio: 'inherit', cwd: root, env: { ...process.env, ...env } });
  children.push(child);
  child.on('exit', (code) => {
    if (!stopping) console.log(`\n${name} stopped (code ${code}). Stopping the rest.`);
    stop();
  });
}

run('Local server', join(root, 'worker', 'scripts', 'local-server.mjs'));
run('App', join(root, 'node_modules', 'vite', 'bin', 'vite.js'), ['--port', '5173', '--strictPort', ...(process.env.WJ_NO_OPEN ? [] : ['--open'])], {
  VITE_SERVER_URL: SERVER_URL,
});

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
