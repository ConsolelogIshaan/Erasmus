import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const log = fs.openSync(path.join(cwd, 'relay', 'supervisor.log'), 'a');
const supervisor = spawn(process.execPath, ['relay/supervisor.mjs'], {
  cwd, detached: true, stdio: ['ignore', log, log], windowsHide: true,
});
fs.closeSync(log);
supervisor.unref();
console.warn('[Daemon] Started supervised relay and tunnel:', supervisor.pid);
