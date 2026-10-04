import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Production checks the registered relay through its existing Worker binding.
  // A Worker's localhost is not the user's laptop.
  if (process.env.NODE_ENV !== 'development') {
    let cloudEnv: { HLS_RELAY?: { fetch(request: Request): Promise<Response> } } | undefined;
    try {
      cloudEnv = getCloudflareContext().env as unknown as typeof cloudEnv;
    } catch { /* A local Node production server has no Cloudflare context. */ }
    if (cloudEnv) {
      try {
        if (!cloudEnv.HLS_RELAY) throw new Error('Relay health binding unavailable');
        const response = await cloudEnv.HLS_RELAY.fetch(new Request(
          'https://erasmus-hls-relay.erasmustv.workers.dev/status',
          { signal: AbortSignal.timeout(6000), cache: 'no-store' },
        ));
        if (!response.ok) throw new Error('Relay health request failed');
        const health = await response.json() as {
          service?: string;
          activeTunnel?: string;
          isTunnelAlive?: boolean;
          relay?: { port?: number; cache?: Record<string, unknown> } | null;
        };
        if (health.service !== 'Erasmus HLS Dynamic Smart Relay'
          || typeof health.isTunnelAlive !== 'boolean') throw new Error('Invalid relay health response');
        const tunnelUrl = typeof health.activeTunnel === 'string' && health.activeTunnel !== 'none'
          ? health.activeTunnel : null;
        const online = health.isTunnelAlive && Boolean(tunnelUrl);
        return NextResponse.json({
          relay: { status: online ? 'online' : 'offline', port: health.relay?.port ?? 8443, cache: health.relay?.cache ?? null },
          tunnel: { status: online ? 'connected' : 'offline', url: tunnelUrl, verified: online },
          worker: { synced: Boolean(tunnelUrl) },
          timestamp: new Date().toISOString(),
        }, { headers: { 'Cache-Control': 'no-store' } });
      } catch {
        return NextResponse.json({
          relay: { status: 'unknown', port: 8443, cache: null },
          tunnel: { status: 'unknown', url: null, verified: false },
          worker: { synced: false },
          timestamp: new Date().toISOString(),
        }, { headers: { 'Cache-Control': 'no-store' } });
      }
    }
  }

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

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
