import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns';
import { Agent } from 'undici';

const tunnelDns = new dns.promises.Resolver();
tunnelDns.setServers(['1.1.1.1', '8.8.8.8']);
// Fresh Quick Tunnel names can be negatively cached by the PC's DNS resolver.
// Use public DNS only if the ordinary lookup fails; TLS validation stays enabled.
const tunnelProbeAgent = new Agent({ connect: {
  lookup(hostname, options, callback) {
    dns.lookup(hostname, options, (error, address, family) => {
      if (!error) return callback(null, address, family);
      tunnelDns.resolve4(hostname).then((addresses) => {
        if (options.all) callback(null, addresses.map((entry) => ({ address: entry, family: 4 })));
        else callback(null, addresses[0], 4);
      }).catch(() => callback(error));
    });
  },
} });

const CWD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLOUDFLARED_BIN = 'C:\\Users\\Administrator\\bin\\cloudflared.exe';
const PRIMARY_WORKER_URL = 'https://erasmus-hls-relay.erasmustv.workers.dev';
const SYNC_SECRET = 'erasmus_relay_tunnel_key_9247f1';

const STATUS_FILE = path.join(CWD, 'relay', 'status.json');
const CURRENT_URL_FILE = path.join(CWD, 'relay', 'CURRENT_TUNNEL_URL.txt');
const TUNNEL_LOG_FILE = path.join(CWD, 'relay', 'tunnel.log');
const RELAY_LOG_FILE = path.join(CWD, 'relay', 'relay.log');

let relayProc = null;
let tunnelProc = null;
let currentTunnelUrl = '';
let isTunnelVerified = false;
let lastVerificationTime = 0;
let consecutiveTunnelFailures = 0;
let tunnelSpawnTime = 0;
let syncedTunnelUrl = '';
let verificationRunning = false;
let lastSyncCheck = 0;
let shuttingDown = false;
const PID_FILE = path.join(CWD, 'relay', 'supervisor.pid');
// All launchers share one supervisor so they cannot race over the tunnel URL.
if (fs.existsSync(PID_FILE)) {
  const previousPid = Number(fs.readFileSync(PID_FILE, 'utf8'));
  if (Number.isInteger(previousPid) && previousPid > 0) {
    try {
      process.kill(previousPid, 0);
      console.warn('[Supervisor] Already running.');
      process.exit(0);
    } catch {}
  }
  fs.unlinkSync(PID_FILE);
}
try {
  fs.writeFileSync(PID_FILE, String(process.pid), { flag: 'wx' });
} catch {
  console.warn('[Supervisor] Another supervisor is starting.');
  process.exit(0);
}

function writeStatus(extra = {}) {
  const status = {
    relay: {
      status: relayProc && !relayProc.killed ? 'online' : 'offline',
      port: 8443,
      pid: relayProc?.pid || null,
    },
    tunnel: {
      status: isTunnelVerified ? 'connected' : currentTunnelUrl ? 'connecting' : 'offline',
      url: currentTunnelUrl || null,
      verified: isTunnelVerified,
      lastVerified: lastVerificationTime ? new Date(lastVerificationTime).toISOString() : null,
      pid: tunnelProc?.pid || null,
      uptimeSeconds: tunnelSpawnTime ? Math.floor((Date.now() - tunnelSpawnTime) / 1000) : 0,
    },
    worker: {
      url: PRIMARY_WORKER_URL,
      synced: isTunnelVerified && syncedTunnelUrl === currentTunnelUrl,
    },
    updatedAt: new Date().toISOString(),
    ...extra,
  };
  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2), 'utf8');
  } catch {}
}

function startRelay() {
  if (shuttingDown) return;
  if (relayProc && !relayProc.killed) return;
  console.log('[Supervisor] Starting local HLS relay on port 8443...');
  const outLog = fs.openSync(RELAY_LOG_FILE, 'a');
  relayProc = spawn(process.execPath, ['relay/erasmus-relay.mjs'], {
    cwd: CWD,
    stdio: ['ignore', outLog, outLog],
    windowsHide: true,
  });
  fs.closeSync(outLog);

  relayProc.on('exit', (code) => {
    console.warn(`[Supervisor] Relay exited with code ${code}. Restarting in 2s...`);
    relayProc = null;
    writeStatus();
    if (!shuttingDown) setTimeout(startRelay, 2000);
  });

  writeStatus();
}

function startTunnel() {
  if (shuttingDown) return;
  if (tunnelProc && !tunnelProc.killed) return;

  // Clear stale tunnel URL & log
  currentTunnelUrl = '';
  isTunnelVerified = false;
  syncedTunnelUrl = '';
  consecutiveTunnelFailures = 0;
  tunnelSpawnTime = Date.now();
  writeStatus();

  try {
    if (fs.existsSync(TUNNEL_LOG_FILE)) fs.writeFileSync(TUNNEL_LOG_FILE, '', 'utf8');
  } catch {}

  console.log('[Supervisor] Spawning fresh Cloudflare Tunnel...');

  tunnelProc = spawn(CLOUDFLARED_BIN, ['tunnel', '--url', 'http://localhost:8443'], {
    cwd: CWD,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  function processTunnelOutput(data) {
    const text = data.toString();
    try { fs.appendFileSync(TUNNEL_LOG_FILE, text); } catch {}

    // Check for fatal tunnel error: "Unauthorized: Tunnel not found"
    if (text.includes('Unauthorized: Tunnel not found') || text.includes('Register tunnel error from server side')) {
      console.warn('[Supervisor] Cloudflare rejected tunnel session (Unauthorized). Restarting tunnel...');
      killTunnel();
      return;
    }

    // Extract quick tunnel URL
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && match[0] && match[0] !== currentTunnelUrl) {
      currentTunnelUrl = match[0];
      fs.writeFileSync(CURRENT_URL_FILE, currentTunnelUrl, 'utf8');
      console.log(`[Supervisor] Detected Quick Tunnel URL: ${currentTunnelUrl}. Allowing 6s for global edge propagation...`);
      writeStatus();
      // Allow global DNS and TLS cert propagation before first probe
      setTimeout(verifyTunnelAndSync, 6000);
    }
  }

  tunnelProc.stdout.on('data', processTunnelOutput);
  tunnelProc.stderr.on('data', processTunnelOutput);

  tunnelProc.on('exit', (code) => {
    console.warn(`[Supervisor] Tunnel process exited with code ${code}. Restarting in 4s...`);
    tunnelProc = null;
    isTunnelVerified = false;
    currentTunnelUrl = '';
    syncedTunnelUrl = '';
    writeStatus();
    if (!shuttingDown) setTimeout(startTunnel, 4000);
  });

  writeStatus();
}

function killTunnel() {
  if (tunnelProc) {
    try {
      tunnelProc.kill('SIGKILL');
    } catch {}
    tunnelProc = null;
  }
  isTunnelVerified = false;
  writeStatus();
}

async function verifyTunnelAndSync() {
  if (!currentTunnelUrl || verificationRunning) return false;
  verificationRunning = true;
  const probingUrl = currentTunnelUrl;

  try {
    const res = await fetch(`${currentTunnelUrl}/health`, {
      signal: AbortSignal.timeout(6000),
      dispatcher: tunnelProbeAgent,
    });
    if (res.ok) {
      if (probingUrl !== currentTunnelUrl) return false;
      isTunnelVerified = true;
      lastVerificationTime = Date.now();
      consecutiveTunnelFailures = 0;
      console.log(`[Supervisor] Verified tunnel health via HTTPS: 200 OK (${currentTunnelUrl})`);
      writeStatus();

      // Register with Cloudflare Worker
      if (syncedTunnelUrl !== currentTunnelUrl || Date.now() - lastSyncCheck > 60_000) {
        lastSyncCheck = Date.now();
        try {
        const targetRes = await fetch(`${PRIMARY_WORKER_URL}/tunnel-url`, {
          signal: AbortSignal.timeout(6000),
        });
        const targetData = await targetRes.json();
        if (targetRes.ok && targetData.tunnelUrl === currentTunnelUrl) {
          syncedTunnelUrl = currentTunnelUrl;
        } else {
          syncedTunnelUrl = '';
          await registerTargetWithWorker(currentTunnelUrl);
        }
        } catch (err) {
          syncedTunnelUrl = '';
          console.warn('[Supervisor] Worker registry check failed:', err.message);
          await registerTargetWithWorker(currentTunnelUrl);
        }
      }
      writeStatus();
      return true;
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    isTunnelVerified = false;
    consecutiveTunnelFailures++;
    console.warn(`[Supervisor] Tunnel verification probe (${consecutiveTunnelFailures}/8): ${err.message}`);
    if (consecutiveTunnelFailures >= 8) {
      console.warn('[Supervisor] Tunnel failed 8 consecutive health probes. Restarting cloudflared...');
      killTunnel();
    }
    return false;
  } finally {
    verificationRunning = false;
    writeStatus();
  }
}

async function registerTargetWithWorker(targetUrl) {
  try {
    const res = await fetch(`${PRIMARY_WORKER_URL}/set-target`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SYNC_SECRET}`,
      },
      body: JSON.stringify({ target: targetUrl }),
      signal: AbortSignal.timeout(6000),
    });
    const data = await res.json();
    if (!res.ok || data.status !== 'ok' || data.target !== targetUrl) {
      throw new Error(`Registration failed: HTTP ${res.status}`);
    }
    if (targetUrl === currentTunnelUrl) syncedTunnelUrl = targetUrl;
    console.log('[Supervisor] Registered target with Cloudflare Worker:', data.status === 'ok' ? 'SUCCESS' : data);
  } catch (err) {
    console.warn('[Supervisor] Could not register with Cloudflare Worker:', err.message);
  }
}

async function sendWorkerHeartbeat() {
  if (!isTunnelVerified) return;
  try {
    await fetch(`${PRIMARY_WORKER_URL}/ping`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SYNC_SECRET}` },
      signal: AbortSignal.timeout(5000),
    });
  } catch {}
}

// 1. Initial Launch
startRelay();
startTunnel();

// 2. Periodic Health Verification & Heartbeat Loop (every 12s)
setInterval(async () => {
  if (currentTunnelUrl) {
    await verifyTunnelAndSync();
    if (isTunnelVerified) {
      await sendWorkerHeartbeat();
    }
  } else {
    if (!tunnelProc) {
      startTunnel();
    }
  }
}, 12000);

// Cleanup on exit
function shutdown() {
  shuttingDown = true;
  console.log('[Supervisor] Shutting down gracefully...');
  if (relayProc) try { relayProc.kill(); } catch {}
  if (tunnelProc) try { tunnelProc.kill(); } catch {}
  relayProc = null;
  tunnelProc = null;
  isTunnelVerified = false;
  syncedTunnelUrl = '';
  writeStatus();
  try { fs.unlinkSync(PID_FILE); } catch {}
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
