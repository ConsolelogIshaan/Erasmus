import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const statusPath = path.join(process.cwd(), 'relay', 'status.json');
  let statusData: Record<string, unknown> = {};

  if (fs.existsSync(statusPath)) {
    try {
      const raw = fs.readFileSync(statusPath, 'utf8');
      statusData = JSON.parse(raw);
    } catch {}
  }

  // Also probe localhost:8443 in real time
  let relayLive = false;
  let relayCacheMetrics: Record<string, unknown> | null = null;
  try {
    const res = await fetch('http://localhost:8443/status', {
      signal: AbortSignal.timeout(1000),
    });
    if (res.ok) {
      relayLive = true;
      const json = (await res.json()) as { cache?: Record<string, unknown> };
      relayCacheMetrics = json.cache || null;
    }
  } catch {}

  const result = {
    relay: {
      status: relayLive ? 'online' : 'offline',
      port: 8443,
      cache: relayCacheMetrics,
      ...(typeof statusData.relay === 'object' && statusData.relay ? statusData.relay : {}),
    },
    tunnel: statusData.tunnel || { status: 'offline', url: null, verified: false },
    worker: statusData.worker || { synced: false },
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(result);
}
