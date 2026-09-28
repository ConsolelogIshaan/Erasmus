import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const cwd = process.cwd();

// 1. Wipe stale tunnel logs and cached URLs so no dead URL is ever read
try {
  const tunnelLogPath = path.join(cwd, 'relay', 'tunnel.log');
  const currentUrlPath = path.join(cwd, 'relay', 'CURRENT_TUNNEL_URL.txt');
  if (fs.existsSync(tunnelLogPath)) fs.unlinkSync(tunnelLogPath);
  if (fs.existsSync(currentUrlPath)) fs.unlinkSync(currentUrlPath);
} catch {}

const relayLog = fs.openSync(path.join(cwd, 'relay', 'relay.log'), 'a');
const tunnelLog = fs.openSync(path.join(cwd, 'relay', 'tunnel.log'), 'a');
const syncLog = fs.openSync(path.join(cwd, 'relay', 'sync.log'), 'a');

console.warn('[Daemon] Spawning independent Relay process on port 8443...');
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

console.warn('[Daemon] Spawning independent Tunnel Sync process...');
const syncProc = spawn('node', ['relay/sync-tunnel-url.mjs'], {
  cwd,
  detached: true,
  stdio: ['ignore', syncLog, syncLog],
  windowsHide: true,
});
syncProc.unref();

console.warn(`[Daemon] Launched! Relay PID: ${relayProc.pid}, Tunnel PID: ${tunnelProc.pid}, Sync PID: ${syncProc.pid}`);
