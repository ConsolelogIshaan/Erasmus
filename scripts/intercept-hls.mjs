import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const chrome =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const kind = process.argv[2] === "tv" ? "tv" : "movie";
const id = process.argv[3] || "284054";
const season = process.argv[4] || "1";
const episode = process.argv[5] || "1";
const target =
  kind === "tv"
    ? `https://vidfast.vc/tv/${id}/${season}/${episode}?autoPlay=true`
    : `https://vidfast.vc/movie/${id}?autoPlay=true`;

const hits = new Set();
function consider(url, type = "") {
  if (
    /\.m3u8(\?|$)/i.test(url) ||
    /\.mpd(\?|$)/i.test(url) ||
    type.includes("mpegurl") ||
    type.includes("dash+xml")
  ) {
    hits.add(url);
  }
}

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: false,
  defaultViewport: { width: 1280, height: 720 },
  args: [
    "--no-sandbox",
    "--mute-audio",
    "--autoplay-policy=no-user-gesture-required",
    "--disable-blink-features=AutomationControlled",
    "--window-size=1280,720",
  ],
});

try {
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.error("PAGEERR", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("CONS", msg.text().slice(0, 160));
  });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  );
  page.on("request", (req) => {
    consider(req.url());
    const u = req.url();
    if (
      ["xhr", "fetch"].includes(req.resourceType()) &&
      !u.includes("google-analytics") &&
      !u.includes("umami") &&
      !u.includes("cdn-cgi")
    ) {
      console.error("REQ", req.method(), req.resourceType(), u.slice(0, 160));
    }
  });
  page.on("response", (res) =>
    consider(res.url(), res.headers()["content-type"] || ""),
  );
  const wrapper = `data:text/html,<!doctype html><iframe src="${target}" style="position:fixed;inset:0;width:100%;height:100%;border:0" allow="autoplay;encrypted-media;fullscreen" allowfullscreen></iframe>`;
  const nav = await page.goto(wrapper, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => e.message);
  const html = await page.content();
  await page.waitForSelector("video, iframe, body", { timeout: 15000 }).catch(() => {});
  await page.mouse.click(640, 400);
  await new Promise((r) => setTimeout(r, 20000));
  const stats = await page.evaluate(() => ({
    videos: document.querySelectorAll("video").length,
    iframes: document.querySelectorAll("iframe").length,
    scripts: document.querySelectorAll("script").length,
    text: (document.body?.innerText || "").slice(0, 160),
    resources: performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((n) => /365-|aaea2bcf|1bd47015|uto|m3u8|wyzie/i.test(n))
      .slice(0, 20),
  }));
  console.error("STATS", JSON.stringify(stats));
  const title = await page.title();
  process.stdout.write(
    JSON.stringify({
      ok: hits.size > 0,
      title,
      url: page.url(),
      nav: String(nav).slice(0, 80),
      html: html.length,
      snippet: html.replace(/\s+/g, " ").slice(0, 200),
      hits: [...hits],
      target,
    }),
  );
} finally {
  await browser.close();
}
