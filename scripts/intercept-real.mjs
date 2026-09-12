import { connect } from "puppeteer-real-browser";

const kind = process.argv[2] === "tv" ? "tv" : "movie";
const id = process.argv[3];
const season = process.argv[4] || "1";
const episode = process.argv[5] || "1";
if (!id) {
  process.stdout.write(JSON.stringify({ ok: false, error: "missing id" }));
  process.exit(1);
}

const embedArg = process.argv[6] || "";
const target = embedArg.startsWith("http")
  ? embedArg
  : kind === "tv"
    ? `https://vidfast.vc/tv/${id}/${season}/${episode}?autoPlay=true`
    : `https://vidfast.vc/movie/${id}?autoPlay=true`;

let embedOrigin = "https://vidfast.vc/";
try {
  embedOrigin = `${new URL(target).origin}/`;
} catch {
  /* keep default */
}

const AD =
  /doubleclick|googlesyndication|adsystem|\/ads\/|advert|vast\.|vmap|imasdk|pagead|adnxs|pubmatic|exoclick|popads|propeller|adtraffic|s0\.2mdn|prebid|taboola|outbrain|mgid|adform|openx|rubicon/i;

const hits = [];

function refererFromMediaUrl(url) {
  try {
    const parsed = new URL(url);
    const raw = parsed.searchParams.get("headers");
    if (!raw) return null;
    const headers = JSON.parse(raw);
    if (typeof headers?.referer === "string" && headers.referer.startsWith("http")) {
      return headers.referer;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function classify(url) {
  if (!url || typeof url !== "string") return null;
  if (url.startsWith("blob:") || url.startsWith("data:")) return null;
  if (AD.test(url)) return null;
  const path = url.split("?")[0];
  if (
    /\.m3u8$/i.test(path) ||
    /\/master\.m3u8/i.test(url) ||
    /playlist\.m3u8/i.test(url) ||
    /index-s\d+p/i.test(url) ||
    /[?&](playlist|type)=m3u8/i.test(url)
  ) {
    return "hls";
  }
  if (/\.mp4$/i.test(path) && !/preview|sample|thumb|sprite|trailer/i.test(url)) {
    return "file";
  }
  return null;
}

function cleanUrl(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw
    .trim()
    .replace(/\\n.*/g, "")
    .replace(/[\\]+$/g, "")
    .replace(/["'}]+$/g, "");
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function addHit(url, hitKind, requestReferer, height = 0) {
  url = cleanUrl(url);
  if (!url || url.startsWith("blob:") || url.startsWith("data:")) return;
  if (AD.test(url)) return;
  const existing = hits.find((hit) => hit.url === url);
  if (existing) {
    if (height > (existing.height || 0)) existing.height = height;
    return;
  }
  hits.push({
    url,
    kind: hitKind,
    height,
    referer: requestReferer || refererFromMediaUrl(url) || embedOrigin,
  });
}

function consider(url, requestReferer) {
  const hitKind = classify(url);
  if (!hitKind) return;
  addHit(url, hitKind, requestReferer);
}

function harvestPlaylist(text, requestReferer) {
  if (!text || !text.includes("#EXTM3U")) return;
  const lines = text.replace(/\\n/g, "\n").split("\n");
  let lastInf = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#EXT-X-STREAM-INF")) {
      lastInf = trimmed;
      continue;
    }
    if (trimmed.startsWith("http")) {
      const heightMatch = /RESOLUTION=\d+x(\d+)/i.exec(lastInf);
      const height = heightMatch ? Number(heightMatch[1]) : 0;
      addHit(cleanUrl(trimmed), "hls", requestReferer, height);
      lastInf = "";
    }
  }
}

function harvestText(text, requestReferer) {
  if (!text || typeof text !== "string") return;
  harvestPlaylist(text, requestReferer);
  const found = text.match(/https?:\/\/[^"'\\\s]+/g) || [];
  for (const url of found) {
    const cleaned = url.replace(/[),.;]+$/, "");
    consider(cleaned, requestReferer);
  }
}

function pick() {
  const rank = (hit) => {
    if (/master\.m3u8/i.test(hit.url)) return 0;
    if (hit.kind === "hls" && (hit.height || 0) >= 1080) return 1;
    if (hit.kind === "hls" && /playlist/i.test(hit.url)) return 2;
    if (hit.kind === "hls") return 3;
    if (hit.kind === "file") return 4;
    return 8;
  };
  return [...hits].sort((a, b) => {
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    return (b.height || 0) - (a.height || 0);
  })[0];
}

const { browser, page } = await connect({
  headless: false,
  turnstile: true,
  disableXvfb: true,
  args: ["--window-position=-2400,-2400", "--window-size=1280,800", "--mute-audio"],
});

async function harvestPage() {
  for (const frame of page.frames()) {
    try {
      const extra = await frame.evaluate(() => window.__ARGUS_URLS__ || []);
      extra.forEach((url) => consider(url));
    } catch {
      /* cross-origin */
    }
    try {
      await frame.evaluate(() => {
        const video = document.querySelector("video");
        if (video) {
          video.muted = true;
          video.play().catch(() => {});
        }
        document
          .querySelectorAll(
            "button, .jw-icon-display, .vjs-big-play-button, .plyr__control--overlaid, [class*='play'], [aria-label*='Play' i]",
          )
          .forEach((el) => {
            try {
              el.click();
            } catch {}
          });
      });
    } catch {
      /* cross-origin frame */
    }
  }
}

try {
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluateOnNewDocument(() => {
    const push = (url) => {
      if (!url) return;
      window.__ARGUS_URLS__ = window.__ARGUS_URLS__ || [];
      if (!window.__ARGUS_URLS__.includes(url)) window.__ARGUS_URLS__.push(url);
    };
    const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
    if (desc?.set) {
      Object.defineProperty(HTMLMediaElement.prototype, "src", {
        configurable: true,
        get() {
          return desc.get.call(this);
        },
        set(value) {
          push(String(value));
          return desc.set.call(this, value);
        },
      });
    }
    const origSet = HTMLMediaElement.prototype.setAttribute;
    HTMLMediaElement.prototype.setAttribute = function (name, value) {
      if (String(name).toLowerCase() === "src") push(String(value));
      return origSet.call(this, name, value);
    };
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
      const url = String(args[0]?.url || args[0] || "");
      push(url);
      const res = await origFetch.apply(this, args);
      try {
        const text = await res.clone().text();
        const match = text.match(/https?:\/\/[^"'\s]+/gi);
        if (match) match.forEach(push);
        if (text.includes("#EXTM3U")) {
          window.__ARGUS_URLS__.push(`manifest:${text.slice(0, 8000)}`);
        }
      } catch {
        /* ignore */
      }
      return res;
    };
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      push(String(url));
      return origOpen.call(this, method, url, ...rest);
    };
  });

  const client = await page.createCDPSession();
  await client.send("Network.enable");
  const pending = new Map();
  client.on("Network.requestWillBeSent", (event) => {
    const headers = event.request?.headers || {};
    consider(event.request?.url, headers.Referer || headers.referer);
  });
  client.on("Network.responseReceived", (event) => {
    const url = event.response?.url || "";
    const mime = event.response?.mimeType || "";
    consider(url);
    if (/mpegurl|m3u8/i.test(mime) && url.startsWith("https:")) {
      addHit(url, "hls");
    }
    if (/json|mpegurl|m3u8|text\/plain|xml/i.test(mime)) {
      pending.set(event.requestId, url);
    }
  });
  client.on("Network.loadingFinished", async (event) => {
    if (!pending.has(event.requestId)) return;
    pending.delete(event.requestId);
    try {
      const body = await client.send("Network.getResponseBody", {
        requestId: event.requestId,
      });
      const text = body.base64Encoded
        ? Buffer.from(body.body, "base64").toString("utf8")
        : body.body;
      harvestText(text);
    } catch {
      /* body unavailable */
    }
  });

  page.on("request", (req) => consider(req.url(), req.headers()?.referer));
  page.on("response", (res) => consider(res.url()));

  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 45000 });
  const deadline = Date.now() + 32000;
  while (Date.now() < deadline) {
    await harvestPage();
    try {
      const extra = await page.evaluate(() => window.__ARGUS_URLS__ || []);
      for (const item of extra) {
        if (typeof item === "string" && item.startsWith("manifest:")) {
          harvestPlaylist(item.slice("manifest:".length));
        } else {
          consider(item);
        }
      }
    } catch {
      /* ignore */
    }
    if (pick()?.kind === "hls") break;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  await harvestPage();
  const master = pick();
  process.stdout.write(
    JSON.stringify({
      ok: Boolean(master),
      referer: master?.referer || embedOrigin,
      servers: master
        ? [{ name: "direct", url: master.url, kind: master.kind }]
        : [],
      error: master ? undefined : "no playlist",
    }),
  );
  if (!master) process.exit(1);
} finally {
  await browser.close().catch(() => {});
}
