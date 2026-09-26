import fs from 'fs';
import path from 'path';

const logPath = path.join(process.cwd(), 'relay', 'tunnel.log');
const envPath = path.join(process.cwd(), '.env.local');
const currentUrlFile = path.join(process.cwd(), 'relay', 'CURRENT_TUNNEL_URL.txt');

function extractAndSync() {
  if (!fs.existsSync(logPath)) return;
  const content = fs.readFileSync(logPath, 'utf8');
  const match = content.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!match) return;

  const tunnelUrl = match[0];
  fs.writeFileSync(currentUrlFile, tunnelUrl, 'utf8');
  console.warn(`[Sync] Active Cloudflare Tunnel: ${tunnelUrl}`);

  if (fs.existsSync(envPath)) {
    let env = fs.readFileSync(envPath, 'utf8');
    const regex = /NEXT_PUBLIC_HLS_RELAY_URL=.*/;
    if (regex.test(env)) {
      env = env.replace(regex, `NEXT_PUBLIC_HLS_RELAY_URL=${tunnelUrl}`);
    } else {
      env += `\nNEXT_PUBLIC_HLS_RELAY_URL=${tunnelUrl}\n`;
    }
    fs.writeFileSync(envPath, env, 'utf8');
    console.warn('[Sync] .env.local updated successfully with new tunnel URL.');
  }
}

// Check immediately and repeat for up to 15 seconds after startup
let attempts = 0;
const interval = setInterval(() => {
  attempts++;
  try {
    extractAndSync();
    if (fs.existsSync(currentUrlFile) || attempts > 15) {
      clearInterval(interval);
    }
  } catch {}
}, 1000);
