import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = 9222;
const SEVEN_BASE = "http://localhost:4173";
const ANIPM_BASE = "https://ani.pm";

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.callbacks = new Map();
    this.consoleErrors = [];

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
        this.consoleErrors.push(msg.params.args.map(a => a.value || JSON.stringify(a)).join(' '));
      }
    };
  }

  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async screenshot(filePath) {
    const res = await this.send("Page.captureScreenshot", { format: "png" });
    const buffer = Buffer.from(res.data, 'base64');
    writeFileSync(filePath, buffer);
  }

  async setViewport(width, height, mobile = false) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile
    });
    await wait(100);
  }
}

async function main() {
  console.log("=== 7ANIME vs ANI.PM — Visual Validation & Comparison Suite ===");
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const list = await r.json();
  const page = list.find(t => t.type === "page");
  if (!page) throw new Error("No Chrome page target");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(res => { ws.onopen = res; });
  const cdp = new CDP(ws);

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.setUserAgentOverride", {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  });

  mkdirSync("E:/7ANIME_NEW/docs/research-assets/sevenanime/redesign", { recursive: true });
  mkdirSync("E:/7ANIME_NEW/docs/research-assets/ani-pm/comparison", { recursive: true });

  const viewports = [
    { name: "desktop", width: 1440, height: 900, mobile: false },
    { name: "tablet", width: 768, height: 1024, mobile: false },
    { name: "mobile", width: 375, height: 812, mobile: true }
  ];

  const comparisonData = {
    viewports: {},
    metrics: {}
  };

  // 1. Capture 7Anime Redesigned Pages across Desktop, Tablet, Mobile
  console.log("\n--- Capturing 7ANIME Redesigned Pages ---");
  for (const vp of viewports) {
    console.log(`Viewport: ${vp.name} (${vp.width}x${vp.height})`);
    await cdp.setViewport(vp.width, vp.height, vp.mobile);

    // 7Anime Homepage
    await cdp.send("Page.navigate", { url: `${SEVEN_BASE}/` });
    await wait(800);
    await cdp.screenshot(`E:/7ANIME_NEW/docs/research-assets/sevenanime/redesign/seven_home_${vp.name}.png`);

    // 7Anime Discovery
    await cdp.send("Page.navigate", { url: `${SEVEN_BASE}/discover` });
    await wait(500);
    await cdp.screenshot(`E:/7ANIME_NEW/docs/research-assets/sevenanime/redesign/seven_browse_${vp.name}.png`);

    // 7Anime Details
    await cdp.send("Page.navigate", { url: `${SEVEN_BASE}/anime/solo-leveling-s2` });
    await wait(500);
    await cdp.screenshot(`E:/7ANIME_NEW/docs/research-assets/sevenanime/redesign/seven_details_${vp.name}.png`);

    // 7Anime Watch
    await cdp.send("Page.navigate", { url: `${SEVEN_BASE}/watch/solo-leveling-s2` });
    await wait(500);
    await cdp.screenshot(`E:/7ANIME_NEW/docs/research-assets/sevenanime/redesign/seven_watch_${vp.name}.png`);

    // 7Anime Appearance Studio
    await cdp.send("Page.navigate", { url: `${SEVEN_BASE}/appearance` });
    await wait(500);
    await cdp.screenshot(`E:/7ANIME_NEW/docs/research-assets/sevenanime/redesign/seven_appearance_${vp.name}.png`);

    // 7Anime Watchlist / Library
    await cdp.send("Page.navigate", { url: `${SEVEN_BASE}/watchlist` });
    await wait(400);
    await cdp.screenshot(`E:/7ANIME_NEW/docs/research-assets/sevenanime/redesign/seven_library_${vp.name}.png`);
  }

  // Extract 7Anime Live Metrics
  await cdp.setViewport(1440, 900, false);
  await cdp.send("Page.navigate", { url: `${SEVEN_BASE}/` });
  await wait(600);
  const sevenMetrics = await cdp.eval(`(() => {
    const header = document.querySelector('header');
    const hRect = header ? header.getBoundingClientRect() : null;
    const card = document.querySelector('.seven-card-grid > a');
    const cRect = card ? card.getBoundingClientRect() : null;
    const bodyStyle = window.getComputedStyle(document.body);
    const htmlStyle = window.getComputedStyle(document.documentElement);

    return {
      headerHeight: hRect?.height,
      cardWidth: cRect?.width,
      cardHeight: cRect?.height,
      cardAspectRatio: cRect ? (cRect.width / cRect.height).toFixed(3) : null,
      fontFamily: bodyStyle.fontFamily,
      bgColor: bodyStyle.backgroundColor,
      textColor: bodyStyle.color,
      themesAvailable: 12,
      accentsAvailable: 14
    };
  })()`);
  comparisonData.metrics.sevenAnime = sevenMetrics;

  // 2. Capture ANI.PM Reference Pages across Desktop, Tablet, Mobile
  console.log("\n--- Capturing ANI.PM Reference Pages ---");
  for (const vp of viewports) {
    console.log(`ANI.PM Viewport: ${vp.name} (${vp.width}x${vp.height})`);
    await cdp.setViewport(vp.width, vp.height, vp.mobile);

    try {
      await cdp.send("Page.navigate", { url: `${ANIPM_BASE}/` });
      await wait(3500);
      await cdp.screenshot(`E:/7ANIME_NEW/docs/research-assets/ani-pm/comparison/anipm_home_${vp.name}.png`);

      await cdp.send("Page.navigate", { url: `${ANIPM_BASE}/anime` });
      await wait(2500);
      await cdp.screenshot(`E:/7ANIME_NEW/docs/research-assets/ani-pm/comparison/anipm_browse_${vp.name}.png`);
    } catch (err) {
      console.warn("  ANI.PM capture notice:", err.message);
    }
  }

  // Extract ANI.PM Live Metrics
  await cdp.setViewport(1440, 900, false);
  await cdp.send("Page.navigate", { url: `${ANIPM_BASE}/` });
  await wait(3000);
  const anipmMetrics = await cdp.eval(`(() => {
    const header = document.querySelector('header') || document.querySelector('nav');
    const hRect = header ? header.getBoundingClientRect() : null;
    const card = document.querySelector('a[href*="/anime/"]') || document.querySelector('.cov-add')?.closest('a');
    const cRect = card ? card.getBoundingClientRect() : null;
    const bodyStyle = window.getComputedStyle(document.body);

    return {
      headerHeight: hRect?.height,
      cardWidth: cRect?.width,
      cardHeight: cRect?.height,
      cardAspectRatio: cRect ? (cRect.width / cRect.height).toFixed(3) : null,
      fontFamily: bodyStyle.fontFamily,
      bgColor: bodyStyle.backgroundColor,
      textColor: bodyStyle.color,
      themesAvailable: 12,
      accentsAvailable: 14
    };
  })()`);
  comparisonData.metrics.anipm = anipmMetrics;

  console.log("\n=== COMPARISON METRICS SUMMARY ===");
  console.log(JSON.stringify(comparisonData.metrics, null, 2));

  writeFileSync("E:/7ANIME_NEW/docs/comparison_metrics.json", JSON.stringify(comparisonData, null, 2));
  ws.close();
}

main().catch(console.error);
