import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const cwd = process.cwd();
const relayLog = fs.openSync(path.join(cwd, 'relay', 'relay.log'), 'a');
const tunnelLog = fs.openSync(path.join(cwd, 'relay', 'tunnel.log'), 'a');

console.warn('[Daemon] Spawning independent Relay process...');
const relayProc = spawn('node', ['relay/erasmus-relay.mjs'], {
  cwd,
  detached: true,
  stdio: ['ignore', relayLog, relayLog],
  windowsHide: true,
});
relayProc.unref();

console.warn('[Daemon] Spawning independent Cloudflare Tunnel process...');
const tunnelProc = spawn('C:\\Users\\Administrator\\bin\\cloudflared.exe', ['tunnel', '--url', 'http://localhost:8443'], {
  cwd,
  detached: true,
  stdio: ['ignore', tunnelLog, tunnelLog],
  windowsHide: true,
});
tunnelProc.unref();

console.warn(`[Daemon] Launched! Relay PID: ${relayProc.pid}, Tunnel PID: ${tunnelProc.pid}`);
