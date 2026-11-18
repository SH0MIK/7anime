import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = 9222;
const TARGET_URL = "http://localhost:4173/";

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
        const text = msg.params.args.map(a => a.value || JSON.stringify(a)).join(' ');
        this.consoleErrors.push(text);
        console.error("  [BROWSER ERROR]:", text);
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
    await wait(200);
  }
}

async function main() {
  console.log("=== 7ANIME NEW — Verifying ANI.PM-Based UI Implementation ===");
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const list = await r.json();
  const pageTarget = list.find(t => t.type === "page");
  if (!pageTarget) throw new Error("No page target found");

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise(resolve => ws.onopen = resolve);
  const cdp = new CDP(ws);

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  console.log(`Navigating to ${TARGET_URL}...`);
  await cdp.send("Page.navigate", { url: TARGET_URL });
  await wait(3000);

  const title = await cdp.eval("document.title");
  console.log(`Page Loaded. Title: "${title}"`);

  mkdirSync("E:/7ANIME_NEW/docs/research-assets/sevenanime/anipm_base", { recursive: true });

  // 1. Desktop Viewport (1440x900)
  console.log("Capturing Desktop Viewport (1440x900)...");
  await cdp.setViewport(1440, 900, false);
  await wait(1000);
  await cdp.screenshot("E:/7ANIME_NEW/docs/research-assets/sevenanime/anipm_base/seven_anipm_desktop_1440.png");

  // 2. Tablet Viewport (768x1024)
  console.log("Capturing Tablet Viewport (768x1024)...");
  await cdp.setViewport(768, 1024, false);
  await wait(1000);
  await cdp.screenshot("E:/7ANIME_NEW/docs/research-assets/sevenanime/anipm_base/seven_anipm_tablet_768.png");

  // 3. Mobile Viewport (390x844 - iPhone 12/13/14)
  console.log("Capturing Mobile Viewport (390x844)...");
  await cdp.setViewport(390, 844, true);
  await wait(1000);
  await cdp.screenshot("E:/7ANIME_NEW/docs/research-assets/sevenanime/anipm_base/seven_anipm_mobile_390.png");

  // Reset to desktop for metric extraction
  await cdp.setViewport(1440, 900, false);
  await wait(500);

  // Inspect Live DOM Parity
  const domInspection = await cdp.eval(`(() => {
    const sitebar = document.querySelector('.sitebar');
    const brand = document.querySelector('.sitebar__brand');
    const backupNotice = document.querySelector('.backup-domain');
    const backupLink = document.querySelector('.backup-domain__link');
    const mirrorPill = document.querySelector('.home-activity-pill__mirrors');
    const footerCopy = document.querySelector('.site-footer__copy');
    const footerDisclaimer = document.querySelector('.site-footer__disclaimer');
    const heroSpot = document.querySelector('.spot');
    const spotLogo = document.querySelector('.spot-logo');
    const spotTitle = document.querySelector('.spot-title');
    const playBtn = document.querySelector('.btn-play');
    const cards = Array.from(document.querySelectorAll('.t10, .ac, article')).slice(0, 5).map(c => ({
      className: c.className,
      width: c.offsetWidth,
      height: c.offsetHeight,
      posterAspect: window.getComputedStyle(c.querySelector('.t10-poster, .ac-poster, img') || c).aspectRatio,
      title: c.querySelector('.cov-title')?.innerText || '',
      hasAudioPair: !!c.querySelector('.cov-language'),
      hasScore: !!c.querySelector('.cov-score')
    }));

    const rows = Array.from(document.querySelectorAll('.row, section')).map(r => ({
      className: r.className,
      heading: r.querySelector('.row-h, h2, h3')?.innerText.trim() || ''
    }));

    const overflowCheck = {
      windowWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      hasOverflow: document.documentElement.scrollWidth > window.innerWidth
    };

    return {
      sitebar: {
        height: sitebar?.offsetHeight,
        className: sitebar?.className,
        hasLogoImg: !!brand?.querySelector('img'),
        logoImgSrc: brand?.querySelector('img')?.src,
        logoWidth: brand?.querySelector('img')?.offsetWidth,
        logoHeight: brand?.querySelector('img')?.offsetHeight,
        searchButton: document.querySelector('.sitebar__search')?.innerText.trim()
      },
      backupBanner: {
        present: !!backupNotice,
        text: backupNotice?.innerText.replace(/\s+/g, ' ').trim(),
        linkHref: backupLink?.getAttribute('href'),
        linkText: backupLink?.innerText.trim(),
        containsOldDomain: /ani\.(pm|nz)/i.test(backupNotice?.innerText || ''),
        containsNewBackup: /7anime\.ct\.ws/i.test(backupNotice?.innerText || '')
      },
      activityMirrors: {
        text: mirrorPill?.innerText.replace(/\s+/g, ' ').trim(),
        containsOldDomain: /ani\.(pm|nz)/i.test(mirrorPill?.innerText || '')
      },
      footer: {
        copy: footerCopy?.innerText.trim(),
        disclaimer: footerDisclaimer?.innerText.trim(),
        containsOldDomain: /ani\.(pm|nz)/i.test((footerCopy?.innerText || '') + ' ' + (footerDisclaimer?.innerText || ''))
      },
      toonkotsuBanner: {
        present: !!document.querySelector('.home .tk-promo, .home img[src*="toonkotsu"], a[aria-label*="Toonkotsu"]')
      },
      hero: {
        height: heroSpot?.offsetHeight,
        hasSpotLogoImg: !!spotLogo,
        spotLogoSrc: spotLogo?.src,
        spotLogoWidth: spotLogo?.offsetWidth,
        spotLogoHeight: spotLogo?.offsetHeight,
        playBtnText: playBtn?.innerText.trim(),
        hasLibraryTrigger: !!document.querySelector('.library-status-trigger')
      },
      cards,
      rows,
      overflowCheck
    };
  })()`);

  const results = {
    title,
    consoleErrors: cdp.consoleErrors,
    domInspection
  };

  writeFileSync("E:/7ANIME_NEW/docs/anipm_base_verification.json", JSON.stringify(results, null, 2));
  console.log("Saved verification metrics to docs/anipm_base_verification.json");

  console.log("\n--- Verification Summary ---");
  console.log("Console Errors:", cdp.consoleErrors.length);
  console.log("Sitebar Height:", domInspection.sitebar.height, "px");
  console.log("Brand Logo Rendered:", domInspection.sitebar.hasLogoImg, `(${domInspection.sitebar.logoWidth}x${domInspection.sitebar.logoHeight})`);
  console.log("Backup Banner Text:", `"${domInspection.backupBanner.text}"`);
  console.log("Backup Banner Verified:", domInspection.backupBanner.containsNewBackup && !domInspection.backupBanner.containsOldDomain);
  console.log("Activity Mirrors Old Domain Free:", !domInspection.activityMirrors.containsOldDomain);
  console.log("Footer Old Domain Free:", !domInspection.footer.containsOldDomain, `("${domInspection.footer.copy}")`);
  console.log("Toonkotsu Banner Present on Home:", domInspection.toonkotsuBanner.present);
  console.log("Spotlight Hero Height:", domInspection.hero.height, "px");
  console.log("Spotlight Title Logo Rendered:", domInspection.hero.hasSpotLogoImg, domInspection.hero.spotLogoSrc);
  console.log("Cards Sample Count:", domInspection.cards.length);
  console.log("Horizontal Overflow:", domInspection.overflowCheck.hasOverflow ? "FAIL" : "PASSED (0 overflow)");

  ws.close();
}

main().catch(console.error);
