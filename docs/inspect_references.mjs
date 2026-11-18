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

async function inspectSite(cdp, url, name) {
  console.log(`\n=================== Inspecting ${name} (${url}) ===================`);
  
  await cdp.send("Network.enable");
  await cdp.send("Page.enable");
  await cdp.send("Network.setUserAgentOverride", {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  });

  console.log(`Navigating to ${url}...`);
  try {
    await cdp.send("Page.navigate", { url });
    await wait(4000);
  } catch (err) {
    console.error(`Navigation failed for ${url}:`, err.message);
    return null;
  }

  const currentUrl = await cdp.eval("window.location.href");
  const title = await cdp.eval("document.title");
  console.log(`Loaded URL: ${currentUrl}, Title: ${title}`);

  // Capture Desktop (1440x900)
  await cdp.setViewport(1440, 900, false);
  await wait(1000);
  mkdirSync("E:/7ANIME_NEW/docs/research-assets/references", { recursive: true });
  await cdp.screenshot(`E:/7ANIME_NEW/docs/research-assets/references/${name}_desktop_1440.png`);
  console.log(`Captured ${name}_desktop_1440.png`);

  // Capture Tablet (768x1024)
  await cdp.setViewport(768, 1024, false);
  await wait(1000);
  await cdp.screenshot(`E:/7ANIME_NEW/docs/research-assets/references/${name}_tablet_768.png`);
  console.log(`Captured ${name}_tablet_768.png`);

  // Capture Mobile (390x844)
  await cdp.setViewport(390, 844, true);
  await wait(1000);
  await cdp.screenshot(`E:/7ANIME_NEW/docs/research-assets/references/${name}_mobile_390.png`);
  console.log(`Captured ${name}_mobile_390.png`);

  // Switch back to desktop for DOM inspection
  await cdp.setViewport(1440, 900, false);
  await wait(500);

  // Inspect Navbar, Hero, Title Logos, and Cards structure
  const metrics = await cdp.eval(`(() => {
    const sitebar = document.querySelector('header, .sitebar, nav, [class*="nav"], [class*="header"]');
    const hero = document.querySelector('[class*="spotlight"], [class*="hero"], [class*="featured"], [class*="banner"]');
    const heroLogos = Array.from(document.querySelectorAll('img[class*="logo"], img[alt*="logo"], [class*="title-logo"] img, [class*="spotlight"] img')).map(img => ({
      src: img.src,
      alt: img.alt,
      className: img.className,
      width: img.offsetWidth,
      height: img.offsetHeight
    }));
    const cards = Array.from(document.querySelectorAll('[class*="card"], [class*="poster"], article')).slice(0, 5).map(c => ({
      className: c.className,
      rect: { width: c.offsetWidth, height: c.offsetHeight },
      computedStyle: {
        borderRadius: window.getComputedStyle(c).borderRadius,
        aspectRatio: window.getComputedStyle(c).aspectRatio
      }
    }));

    return {
      sitebar: sitebar ? {
        className: sitebar.className,
        height: sitebar.offsetHeight,
        computed: {
          backgroundColor: window.getComputedStyle(sitebar).backgroundColor,
          backdropFilter: window.getComputedStyle(sitebar).backdropFilter,
          borderBottom: window.getComputedStyle(sitebar).borderBottom
        },
        links: Array.from(sitebar.querySelectorAll('a, button')).map(el => ({
          text: el.innerText.trim(),
          tag: el.tagName,
          className: el.className
        }))
      } : null,
      hero: hero ? {
        className: hero.className,
        height: hero.offsetHeight,
        innerHTMLSnippet: hero.innerHTML.slice(0, 1000)
      } : null,
      heroLogos,
      cards,
      bodyStyles: {
        fontFamily: window.getComputedStyle(document.body).fontFamily,
        backgroundColor: window.getComputedStyle(document.body).backgroundColor,
        color: window.getComputedStyle(document.body).color
      }
    };
  })()`);

  return metrics;
}

async function main() {
  console.log("Connecting to Chrome CDP on port " + PORT + "...");
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const list = await r.json();
  const pageTarget = list.find(t => t.type === "page");
  if (!pageTarget) throw new Error("No page target found");

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise(resolve => ws.onopen = resolve);
  const cdp = new CDP(ws);

  const anipmMetrics = await inspectSite(cdp, "https://ani.pm", "anipm");
  const aninzMetrics = await inspectSite(cdp, "https://ani.nz", "aninz");

  const result = {
    anipm: anipmMetrics,
    aninz: aninzMetrics
  };

  writeFileSync("E:/7ANIME_NEW/docs/reference_inspection.json", JSON.stringify(result, null, 2));
  console.log("\nSaved reference inspection to E:/7ANIME_NEW/docs/reference_inspection.json");
  ws.close();
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});

