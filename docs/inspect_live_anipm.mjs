import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = 9222;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.callbacks = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
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
}

async function main() {
  console.log("Connecting to Chrome CDP...");
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const list = await r.json();
  const pageTarget = list.find(t => t.type === "page");
  if (!pageTarget) throw new Error("No Chrome page target");

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  const cdp = new CDP(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.setUserAgentOverride", {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  });

  // Set viewport to 1440x900
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });

  mkdirSync("E:/7ANIME_NEW/docs/research-assets/ani-pm/live", { recursive: true });

  console.log("Navigating to https://ani.pm/ ...");
  await cdp.send("Page.navigate", { url: "https://ani.pm/" });
  await wait(4000);

  const homeTitle = await cdp.eval("document.title");
  console.log("Homepage title:", homeTitle);

  // Capture homepage
  await cdp.screenshot("E:/7ANIME_NEW/docs/research-assets/ani-pm/live/live_home_1440.png");

  // Inspect layout metrics
  const layoutMetrics = await cdp.eval(`(() => {
    const header = document.querySelector('header') || document.querySelector('nav');
    const headerRect = header ? header.getBoundingClientRect() : null;
    const cards = Array.from(document.querySelectorAll('a')).filter(a => a.href && (a.href.includes('/anime/') || a.querySelector('img')));
    const cardRect = cards[0] ? cards[0].getBoundingClientRect() : null;
    
    // Extract root CSS variables
    const computed = window.getComputedStyle(document.documentElement);
    const bodyComputed = window.getComputedStyle(document.body);

    // Get all navigation links
    const navLinks = Array.from(document.querySelectorAll('header a, nav a')).map(a => ({
      text: a.innerText.trim(),
      href: a.href
    }));

    return {
      headerRect,
      cardRect,
      navLinks: navLinks.slice(0, 15),
      bodyBg: bodyComputed.backgroundColor,
      bodyColor: bodyComputed.color,
      fontFamily: bodyComputed.fontFamily
    };
  })()`);
  console.log("Live Layout Metrics:", JSON.stringify(layoutMetrics, null, 2));

  // Inspect settings / appearance
  console.log("Navigating to https://ani.pm/settings/appearance ...");
  await cdp.send("Page.navigate", { url: "https://ani.pm/settings/appearance" });
  await wait(3000);
  await cdp.screenshot("E:/7ANIME_NEW/docs/research-assets/ani-pm/live/live_appearance_1440.png");

  const appearanceDom = await cdp.eval(`(() => {
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, label')).map(h => h.innerText.trim());
    const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean);
    return {
      headings: headings.slice(0, 25),
      buttonLabels: buttons.slice(0, 30)
    };
  })()`);
  console.log("Appearance DOM:", JSON.stringify(appearanceDom, null, 2));

  // Also capture Mobile 375x812
  console.log("Switching to Mobile 375x812...");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 375,
    height: 812,
    deviceScaleFactor: 1,
    mobile: true
  });
  await cdp.send("Page.navigate", { url: "https://ani.pm/" });
  await wait(3000);
  await cdp.screenshot("E:/7ANIME_NEW/docs/research-assets/ani-pm/live/live_home_375.png");

  ws.close();
}

main().catch(console.error);
