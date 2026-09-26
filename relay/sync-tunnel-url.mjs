import fs from 'fs';
import path from 'path';

const WORKER_URL = 'https://erasmus-hls-relay.erasmustv.workers.dev';
const SYNC_SECRET = 'erasmus_relay_tunnel_key_9247f1';

const logPath = path.join(process.cwd(), 'relay', 'tunnel.log');
const envPath = path.join(process.cwd(), '.env.local');
const currentUrlFile = path.join(process.cwd(), 'relay', 'CURRENT_TUNNEL_URL.txt');

let lastRegisteredUrl = '';

async function registerWithWorker(tunnelUrl) {
  try {
    const res = await fetch(`${WORKER_URL}/set-target`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SYNC_SECRET}`,
      },
      body: JSON.stringify({ target: tunnelUrl }),
    });
    const data = await res.json();
    console.warn(`[Sync] Registered with Cloudflare Worker (${WORKER_URL}):`, data.status === 'ok' ? 'SUCCESS' : data);
    return true;
  } catch (err) {
    console.warn('[Sync] Could not reach Cloudflare Worker:', err.message);
    return false;
  }
}

async function sendHeartbeat() {
  try {
    await fetch(`${WORKER_URL}/ping`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SYNC_SECRET}`,
      },
    });
  } catch {}
}

async function checkAndSync() {
  let tunnelUrl = '';
  if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf8');
    const matches = [...content.matchAll(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g)];
    if (matches.length) {
      tunnelUrl = matches[matches.length - 1][0];
    }
  }
  if (!tunnelUrl && fs.existsSync(currentUrlFile)) {
    const raw = fs.readFileSync(currentUrlFile, 'utf8').trim();
    if (/https:\/\/[a-z0-9-]+\.trycloudflare\.com/.test(raw)) {
      tunnelUrl = raw;
    }
  }
  if (!tunnelUrl) return false;


  if (tunnelUrl !== lastRegisteredUrl) {
    lastRegisteredUrl = tunnelUrl;
    fs.writeFileSync(currentUrlFile, tunnelUrl, 'utf8');
    console.warn(`[Sync] Active Cloudflare Quick Tunnel: ${tunnelUrl}`);

    // Update .env.local with permanent Worker URL so dev and local builds use it
    if (fs.existsSync(envPath)) {
      let env = fs.readFileSync(envPath, 'utf8');
      const regex = /NEXT_PUBLIC_HLS_RELAY_URL=.*/;
      if (regex.test(env)) {
        env = env.replace(regex, `NEXT_PUBLIC_HLS_RELAY_URL=${WORKER_URL}`);
      } else {
        env += `\nNEXT_PUBLIC_HLS_RELAY_URL=${WORKER_URL}\n`;
      }
      fs.writeFileSync(envPath, env, 'utf8');
      console.warn(`[Sync] .env.local configured with permanent Worker URL: ${WORKER_URL}`);
    }

    // Register active tunnel target with the Cloudflare Worker
    await registerWithWorker(tunnelUrl);
    return true;
  }
  return true;
}

// Initial detection loop on startup
let initialAttempts = 0;
const startupInterval = setInterval(async () => {
  initialAttempts++;
  const synced = await checkAndSync();
  if (synced || initialAttempts >= 30) {
    clearInterval(startupInterval);
  }
}, 1000);

// Ongoing monitor: periodically verify tunnel URL and send heartbeat every 3 minutes
setInterval(async () => {
  await checkAndSync();
  if (lastRegisteredUrl) {
    await sendHeartbeat();
  }
}, 180000);
