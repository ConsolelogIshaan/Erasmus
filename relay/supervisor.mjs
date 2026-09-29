import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const CWD = process.cwd();
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
      synced: isTunnelVerified,
    },
    updatedAt: new Date().toISOString(),
    ...extra,
  };
  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2), 'utf8');
  } catch {}
}

function startRelay() {
  if (relayProc && !relayProc.killed) return;
  console.log('[Supervisor] Starting local HLS relay on port 8443...');
  const outLog = fs.openSync(RELAY_LOG_FILE, 'a');
  relayProc = spawn('node', ['relay/erasmus-relay.mjs'], {
    cwd: CWD,
    stdio: ['ignore', outLog, outLog],
    windowsHide: true,
  });

  relayProc.on('exit', (code) => {
    console.warn(`[Supervisor] Relay exited with code ${code}. Restarting in 2s...`);
    relayProc = null;
    writeStatus();
    setTimeout(startRelay, 2000);
  });

  writeStatus();
}

function startTunnel() {
  if (tunnelProc && !tunnelProc.killed) return;

  // Clear stale tunnel URL & log
  currentTunnelUrl = '';
  isTunnelVerified = false;
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
    writeStatus();
    setTimeout(startTunnel, 4000);
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
  if (!currentTunnelUrl) return false;

  try {
    const res = await fetch(`${currentTunnelUrl}/health`, {
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      isTunnelVerified = true;
      lastVerificationTime = Date.now();
      consecutiveTunnelFailures = 0;
      console.log(`[Supervisor] Verified tunnel health via HTTPS: 200 OK (${currentTunnelUrl})`);
      writeStatus();

      // Register with Cloudflare Worker
      await registerTargetWithWorker(currentTunnelUrl);
      return true;
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    consecutiveTunnelFailures++;
    console.warn(`[Supervisor] Tunnel verification probe (${consecutiveTunnelFailures}/8): ${err.message}`);
    if (consecutiveTunnelFailures >= 8) {
      console.warn('[Supervisor] Tunnel failed 8 consecutive health probes. Restarting cloudflared...');
      killTunnel();
    }
    return false;
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
process.on('SIGINT', () => {
  console.log('[Supervisor] Shutting down gracefully...');
  if (relayProc) try { relayProc.kill(); } catch {}
  if (tunnelProc) try { tunnelProc.kill(); } catch {}
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (relayProc) try { relayProc.kill(); } catch {}
  if (tunnelProc) try { tunnelProc.kill(); } catch {}
  process.exit(0);
});
