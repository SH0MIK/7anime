import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = "http://localhost:4173";

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
      } else if (msg.method === "Runtime.consoleAPICalled") {
        if (msg.params.type === "error") {
          const text = msg.params.args.map(a => a.value || JSON.stringify(a)).join(' ');
          this.consoleErrors.push(text);
          console.error("  [BROWSER ERROR]:", text);
        }
      } else if (msg.method === "Runtime.exceptionThrown") {
        const text = msg.params.exceptionDetails.text + " " + (msg.params.exceptionDetails.exception?.description || '');
        this.consoleErrors.push(text);
        console.error("  [BROWSER UNCAUGHT]:", text);
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
      throw new Error(`Eval error in "${expr}": ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async setViewport(width, height, isMobile = false) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: isMobile
    });
    await wait(100);
  }

  async navigate(path) {
    await this.send("Page.navigate", { url: `${BASE_URL}${path}` });
    await wait(400);
  }

  async captureScreenshot(filePath) {
    const res = await this.send("Page.captureScreenshot", { format: "png" });
    const buffer = Buffer.from(res.data, 'base64');
    writeFileSync(filePath, buffer);
  }

  async click(selector) {
    const res = await this.eval(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.scrollIntoView({ block: 'center' });
        el.click();
        return true;
      })()
    `);
    if (!res) throw new Error(`Element not found to click: ${selector}`);
    await wait(200);
  }

  async type(selector, text) {
    await this.eval(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.focus();
        el.value = ${JSON.stringify(text)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()
    `);
    await wait(150);
  }
}

async function main() {
  console.log("=== 7ANIME_NEW — Comprehensive Automated Browser QA Suite ===");

  // Connect to Chrome
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const list = await r.json();
  const pageTarget = list.find(t => t.type === "page" && t.url.includes("4173"));
  if (!pageTarget) {
    throw new Error("No Chrome page target found for http://localhost:4173");
  }

  console.log("Connecting to target:", pageTarget.webSocketDebuggerUrl);
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  const cdp = new CDP(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  const results = {
    viewportsTested: [],
    overflowBugs: [],
    routesVerified: [],
    interactionsTested: [],
    consoleErrors: cdp.consoleErrors
  };

  mkdirSync("E:/7ANIME_NEW/docs/research-assets/sevenanime/mobile", { recursive: true });
  mkdirSync("E:/7ANIME_NEW/docs/research-assets/sevenanime/desktop", { recursive: true });

  const routes = [
    { path: "/", name: "Homepage" },
    { path: "/discover", name: "Discovery" },
    { path: "/anime/solo-leveling-s2", name: "Anime Detail" },
    { path: "/watch/solo-leveling-s2", name: "Player & Watch" },
    { path: "/appearance", name: "Appearance Studio" },
    { path: "/watchlist", name: "Watchlist" },
    { path: "/history", name: "History" },
    { path: "/profile", name: "Profile" }
  ];

  const viewports = [
    { name: "Mobile 320px (iPhone SE)", width: 320, height: 568, mobile: true },
    { name: "Mobile 375px (iPhone Standard)", width: 375, height: 812, mobile: true },
    { name: "Mobile 414px (Plus / Max)", width: 414, height: 896, mobile: true },
    { name: "Tablet 768px (iPad)", width: 768, height: 1024, mobile: false },
    { name: "Desktop 1440px (MacBook / Monitor)", width: 1440, height: 900, mobile: false }
  ];

  // 1. Viewport & Horizontal Overflow Testing Across All Routes
  console.log("\n--- PHASE 1: Route & Horizontal Overflow Verification ---");
  for (const vp of viewports) {
    console.log(`\nTesting Viewport: ${vp.name} (${vp.width}x${vp.height})`);
    await cdp.setViewport(vp.width, vp.height, vp.mobile);

    for (const route of routes) {
      await cdp.navigate(route.path);
      await wait(200);

      const check = await cdp.eval(`
        (() => {
          const docEl = document.documentElement;
          const body = document.body;
          const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
          const innerWidth = window.innerWidth;
          const hasOverflow = scrollWidth > innerWidth;

          // Find overflowing element if any
          let overflowingElement = null;
          if (hasOverflow) {
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
              const rect = el.getBoundingClientRect();
              if (rect.right > innerWidth + 1) {
                overflowingElement = {
                  tag: el.tagName,
                  className: el.className ? String(el.className).slice(0, 100) : '',
                  right: rect.right,
                  innerWidth: innerWidth
                };
                break;
              }
            }
          }

          return { scrollWidth, innerWidth, hasOverflow, overflowingElement };
        })()
      `);

      if (check.hasOverflow) {
        console.warn(`  [OVERFLOW DETECTED] ${route.name} (${vp.width}px): scrollWidth=${check.scrollWidth} > innerWidth=${check.innerWidth}`, check.overflowingElement);
        results.overflowBugs.push({
          viewport: vp.name,
          route: route.path,
          scrollWidth: check.scrollWidth,
          innerWidth: check.innerWidth,
          overflowingElement: check.overflowingElement
        });
      } else {
        console.log(`  ✓ ${route.name} (${route.path}): OK (scrollWidth=${check.scrollWidth} <= ${check.innerWidth})`);
      }

      // Capture screenshots on standard mobile (375) and desktop (1440)
      if (vp.width === 375) {
        const fileName = route.path === "/" ? "home" : route.path.replace(/[/\\?%*:|"<>]/g, '_');
        await cdp.captureScreenshot(`E:/7ANIME_NEW/docs/research-assets/sevenanime/mobile/${fileName}_375.png`);
      } else if (vp.width === 1440) {
        const fileName = route.path === "/" ? "home" : route.path.replace(/[/\\?%*:|"<>]/g, '_');
        await cdp.captureScreenshot(`E:/7ANIME_NEW/docs/research-assets/sevenanime/desktop/${fileName}_1440.png`);
      }
    }
  }

  // 2. Interaction Testing
  console.log("\n--- PHASE 2: Deep Interaction Testing ---");
  await cdp.setViewport(1440, 900, false);

  // 2A. Test Appearance Studio Interactions & Persistence
  console.log("\n[Test 2A] Appearance Studio Customization & Persistence:");
  await cdp.navigate("/appearance");
  await wait(300);

  // Switch to Obsidian
  await cdp.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Obsidian'));
    if (btn) btn.click();
  })()`);
  await wait(150);
  const themeAfterObsidian = await cdp.eval(`document.documentElement.getAttribute('data-theme')`);
  console.log(`  Obsidian selected -> data-theme on <html>: "${themeAfterObsidian}"`);

  // Switch to Midnight
  await cdp.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Midnight'));
    if (btn) btn.click();
  })()`);
  await wait(150);
  const themeAfterMidnight = await cdp.eval(`document.documentElement.getAttribute('data-theme')`);
  console.log(`  Midnight selected -> data-theme on <html>: "${themeAfterMidnight}"`);

  // Switch accent to Cyan
  await cdp.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Electric Cyan'));
    if (btn) btn.click();
  })()`);
  await wait(150);
  const accentAfterCyan = await cdp.eval(`document.documentElement.getAttribute('data-accent')`);
  console.log(`  Electric Cyan selected -> data-accent on <html>: "${accentAfterCyan}"`);

  // Switch density to Compact
  await cdp.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Compact Density'));
    if (btn) btn.click();
  })()`);
  await wait(150);
  const densityAfterCompact = await cdp.eval(`document.documentElement.getAttribute('data-density')`);
  console.log(`  Compact density selected -> data-density on <html>: "${densityAfterCompact}"`);

  // Reload page to verify localStorage persistence
  console.log("  Reloading page to test localStorage persistence...");
  await cdp.send("Page.reload");
  await wait(600);
  const themePersisted = await cdp.eval(`document.documentElement.getAttribute('data-theme')`);
  const accentPersisted = await cdp.eval(`document.documentElement.getAttribute('data-accent')`);
  const densityPersisted = await cdp.eval(`document.documentElement.getAttribute('data-density')`);
  console.log(`  After Reload -> theme: "${themePersisted}", accent: "${accentPersisted}", density: "${densityPersisted}"`);

  // Reset defaults
  await cdp.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Reset Defaults'));
    if (btn) btn.click();
  })()`);
  await wait(200);
  const themeReset = await cdp.eval(`document.documentElement.getAttribute('data-theme')`);
  console.log(`  After Reset Defaults -> theme: "${themeReset}" (expected "eclipse")`);

  // 2B. Test Video Player Interactions
  console.log("\n[Test 2B] Video Player UI Interactions:");
  await cdp.navigate("/watch/solo-leveling-s2");
  await wait(300);

  // Click Server 2
  const server2Selected = await cdp.eval(`(() => {
    const srvBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Server 2'));
    if (srvBtns.length > 0) {
      srvBtns[0].click();
      return true;
    }
    return false;
  })()`);
  await wait(600);
  const server2IsActive = await cdp.eval(`(() => {
    const srvBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Server 2'));
    return srvBtns.length > 0 && srvBtns[0].className.includes('seven-accent-bg');
  })()`);
  console.log(`  Server 2 selected -> Button has active seven-accent-bg:`, server2IsActive);

  // Click Episode 2
  await cdp.eval(`(() => {
    const epBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('#2'));
    if (epBtns.length > 0) epBtns[0].click();
  })()`);
  await wait(600);
  const episodeActiveTitle = await cdp.eval(`document.body.innerText`);
  console.log(`  Episode 2 selected -> Page shows EP 2:`, episodeActiveTitle.includes('EP 2') || episodeActiveTitle.includes('Episode 2'));

  // Test Simulate Error and Recovery
  await cdp.eval(`(() => {
    const errBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('[Simulate Error]'));
    if (errBtn) errBtn.click();
  })()`);
  await wait(200);
  const errorDisplayed = await cdp.eval(`document.body.innerText.includes('Playback Stream Unavailable')`);
  console.log(`  Simulate Error Triggered -> Error UI displayed:`, errorDisplayed);

  // Click Retry Connection
  await cdp.eval(`(() => {
    const retryBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Retry Connection'));
    if (retryBtn) retryBtn.click();
  })()`);
  await wait(700);
  const errorDismissed = await cdp.eval(`!document.body.innerText.includes('Playback Stream Unavailable')`);
  console.log(`  Retry Connection clicked -> Stream recovered:`, errorDismissed);

  // 2C. Test Quick Search Modal
  console.log("\n[Test 2C] Quick Search Modal Interactions:");
  await cdp.navigate("/");
  await wait(300);

  // Trigger search modal via button
  await cdp.click('button[title*="Quick Search"]');
  await wait(200);
  const modalOpen = await cdp.eval(`document.querySelector('[role="dialog"]') !== null`);
  console.log(`  Quick Search modal opened:`, modalOpen);

  // Type search query
  await cdp.type('input[placeholder*="Type anime title"]', 'Demon Slayer');
  await wait(250);
  const searchResultsCount = await cdp.eval(`document.querySelectorAll('[role="dialog"] button').length`);
  console.log(`  Typed "Demon Slayer" -> Results count:`, searchResultsCount);

  // Close modal via ESC
  await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await wait(200);
  const modalClosed = await cdp.eval(`document.querySelector('[role="dialog"]') === null`);
  console.log(`  Modal closed with ESC:`, modalClosed);

  // 2D. Test Mobile Drawer Navigation
  console.log("\n[Test 2D] Mobile Drawer Navigation:");
  await cdp.setViewport(375, 812, true);
  await cdp.navigate("/");
  await wait(300);

  // Open drawer
  await cdp.click('button[aria-label="Toggle navigation menu"]');
  await wait(250);
  const drawerOpen = await cdp.eval(`document.body.innerText.includes('Appearance Studio')`);
  console.log(`  Drawer opened on mobile:`, drawerOpen);

  // Click backdrop to close
  await cdp.click('div[aria-hidden="true"]');
  await wait(250);
  const drawerClosed = await cdp.eval(`!document.querySelector('button[aria-label="Close drawer"]')`);
  console.log(`  Drawer dismissed by backdrop click:`, drawerClosed);

  // Write summary results
  console.log("\n=== TEST RUN COMPLETED ===");
  console.log(`Total Overflow Issues Found: ${results.overflowBugs.length}`);
  console.log(`Total Browser Errors Found: ${cdp.consoleErrors.length}`);

  writeFileSync("E:/7ANIME_NEW/docs/qa_test_results.json", JSON.stringify({
    overflowBugs: results.overflowBugs,
    consoleErrors: cdp.consoleErrors,
    status: results.overflowBugs.length === 0 && cdp.consoleErrors.length === 0 ? "PASSED" : "ISSUES_FOUND"
  }, null, 2));

  ws.close();
}

main().catch(err => {
  console.error("FATAL TEST SUITE ERROR:", err);
  process.exit(1);
});
