// Discovery executes inside Cloudflare Browser Run, never a local browser or tunnel.
export interface VidcoreBrowser {
  limits(): Promise<{ usedBrowserTimeSeconds?: number; allowedBrowserAcquisitions?: number; timeUntilNextAllowedBrowserAcquisition?: number }>;
  quickAction(action: string, options: Record<string, unknown>): Promise<Response>;
}
export interface VidcoreSource {
  url?: string;
  tracks?: { file?: string; url?: string; label?: string; kind?: string; language?: string }[];
}
export interface VidcoreDiscovered { mirror: string; source: VidcoreSource }
const discoveryScript = String.raw`
// Runs only in Cloudflare's remote browser for source discovery. Provider media
// and advertising scripts are blocked by the caller's resource rules.
(async () => {
  const finish = data => {
    const result = document.createElement('pre');
    result.id = 'erasmus-vidcore-result';
    result.setAttribute('data-json', encodeURIComponent(JSON.stringify(data)));
    document.body.appendChild(result);
  };
  try {
    const html = document.documentElement.outerHTML;
    const token = html.match(/\\"en\\":\\"([^\\"]+)\\"/)?.[1] || html.match(/"en":"([^"]+)"/)?.[1];
    if (!token) throw new Error('Missing cloud browser VidCore session');
    const request = async (url, init = {}) => {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw new Error('Discovery upstream HTTP ' + response.status);
      return response;
    };
    const decoded = new Map();
    const decode = text => {
      if (decoded.has(text)) return decoded.get(text);
      const pending = (async () => {
        const response = await request('https://enc-dec.app/api/dec-vidcore', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text}) });
        const json = await response.json();
        if (json.status !== 200 || !json.result) throw new Error('VidCore decoding unavailable');
        return json.result;
      })();
      decoded.set(text, pending);
      return pending;
    };
    const session = await (await request('https://enc-dec.app/api/enc-vidcore?text='+encodeURIComponent(token))).json();
    if (session.status !== 200 || !session.result) throw new Error('VidCore session decoding unavailable');
    const {servers,stream,token:csrf} = session.result;
    if (new URL(servers).origin !== location.origin || new URL(stream).origin !== location.origin) throw new Error('Unexpected catalog origin');
    const headers = {'X-Requested-With':'XMLHttpRequest','X-CSRF-Token':csrf};
    const catalog = await decode(await (await request(servers, {method:'POST',headers})).text());
    if (!Array.isArray(catalog)) throw new Error('Invalid catalog');
    const mirrors = catalog.filter(m=>m.data && /^(Supreme|Prime|Premiere 4K|Horizon|Orbit)$/i.test(m.name)).slice(0,5);
    const sources = await Promise.all(mirrors.map(async mirror=>{
      try {
        const response = await request(stream.replace(/\/$/,'')+'/'+encodeURIComponent(mirror.data), {method:'POST',headers});
        const source = await decode(await response.text());
        return source.url ? {mirror:mirror.name,source} : null;
      } catch { return null; }
    }));
    finish({ok:true,sources:sources.filter(Boolean)});
  } catch(error) { finish({ok:false,error:error.message}); }
})();
`;

export async function discoverVidcoreCloud(browser: VidcoreBrowser, path: string): Promise<VidcoreDiscovered[]> {
  const limits = await browser.limits();
  // Leave a minute below the published Free daily quota for in-flight requests.
  // Exhaustion fails explicitly; it never invokes the PC relay.
  if ((limits.usedBrowserTimeSeconds ?? 0) >= 540) throw new Error("VidCore cloud browser daily budget exhausted");
  if (limits.allowedBrowserAcquisitions === 0 || (limits.timeUntilNextAllowedBrowserAcquisition ?? 0) > 0) throw new Error("VidCore cloud discovery busy; please retry shortly");
  const response = await browser.quickAction("content", {
    url: "https://vidcore.io" + path,
    gotoOptions: { timeout: 6000, waitUntil: "domcontentloaded" },
    actionTimeout: 18000,
    rejectResourceTypes: ["script", "image", "media", "font", "stylesheet"],
    addScriptTag: [{ content: discoveryScript }],
    waitForSelector: { selector: "#erasmus-vidcore-result", timeout: 18000 },
  });
  if (response.status === 429) throw new Error("VidCore cloud discovery busy or quota exhausted; please retry later");
  if (!response.ok) throw new Error("VidCore cloud browser HTTP " + response.status);
  const payload = await response.json() as { result?: string };
  const encoded = payload.result?.match(/data-json="([^"<>]+)"/)?.[1];
  if (!encoded) throw new Error("VidCore cloud discovery did not return sources");
  const result = JSON.parse(decodeURIComponent(encoded)) as { ok?: boolean; error?: string; sources?: VidcoreDiscovered[] };
  if (!result.ok || !Array.isArray(result.sources)) throw new Error(result.error || "VidCore cloud discovery failed");
  return result.sources.filter(item => item && typeof item.mirror === "string" && item.source && typeof item.source.url === "string").slice(0, 5);
}
