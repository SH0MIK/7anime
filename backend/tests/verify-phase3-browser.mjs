/**
 * Phase 3 Automated Browser Verification Script
 * Tests details page hero, artwork resolution, trailer background, and responsive layouts via Chrome DevTools Protocol.
 */

const PORT = 9222;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        const text = msg.params.args.map((a) => a.value || JSON.stringify(a)).join(' ');
        // Ignore external third-party iframe errors if any (e.g. youtube tracker blocks)
        if (!text.includes('youtube.com') && !text.includes('doubleclick.net')) {
          this.consoleErrors.push(text);
          console.error('  [BROWSER ERROR]:', text);
        }
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
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.value;
  }
}

const TEST_CASES = [
  { id: 21, name: 'One Piece', hasLogo: true, hasTrailer: true },
  { id: 20, name: 'Naruto', hasLogo: true, hasTrailer: true },
  { id: 1735, name: 'Naruto Shippuden', hasLogo: true, hasTrailer: true },
  { id: 21175, name: 'Dragon Ball Super', hasLogo: true, hasTrailer: true },
  { id: 21519, name: 'Your Name (Kimi no Na wa)', hasLogo: true, hasTrailer: true },
  { id: 5365, name: 'Tsumiki no Ie (No TMDB Logo)', hasLogo: false, hasTrailer: true },
];

async function main() {
  console.log('===============================================================');
  console.log('   7ANIME_NEW — PHASE 3: BROWSER ARTWORK & TRAILER VERIFICATION');
  console.log('===============================================================\n');

  const listRes = await fetch(`http://localhost:${PORT}/json/list`);
  const targets = await listRes.json();
  const pageTarget = targets.find((t) => t.type === 'page');
  if (!pageTarget) throw new Error('No page target available');

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((res) => (ws.onopen = res));
  const cdp = new CDP(ws);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  // Set desktop viewport 1440x900
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  let allPassed = true;

  for (const testCase of TEST_CASES) {
    console.log(`\n--- [INSPECTING] ${testCase.name} (AniList ID: ${testCase.id}) ---`);
    const targetUrl = `http://localhost:4173/anime/${testCase.id}`;

    await cdp.send('Page.navigate', { url: targetUrl });
    await wait(2500); // Allow live metadata + artwork to resolve

    const pageData = await cdp.eval(`
      (() => {
        const titleEl = document.querySelector('h1') || document.querySelector('.spot-logo');
        const logoImg = document.querySelector('img.spot-logo');
        const posterImg = document.querySelector('.detail-poster img');
        const heroBg = document.querySelector('.detail-hero__bg');
        const bgImg = heroBg?.querySelector('img');
        const trailerIframe = heroBg?.querySelector('iframe');
        const audioBtn = heroBg?.querySelector('button');
        const watchNowBtn = document.querySelector('a[href*="ep="]');
        const libraryBtn = document.querySelector('.detail-action-circle');
        const imdbLink = document.querySelector('a[title*="IMDb"]');
        const scoreBadge = document.querySelector('.spot-meta-frost.score') || document.querySelector('.detail-sidebar-row__val');

        return {
          title: titleEl?.innerText || titleEl?.alt || '',
          hasLogoImg: Boolean(logoImg),
          logoSrc: logoImg?.src || null,
          hasPoster: Boolean(posterImg && posterImg.src),
          posterSrc: posterImg?.src || null,
          hasBackdrop: Boolean(bgImg && bgImg.src),
          backdropSrc: bgImg?.src || null,
          hasTrailerIframe: Boolean(trailerIframe),
          trailerSrc: trailerIframe?.src || null,
          hasAudioToggle: Boolean(audioBtn),
          hasWatchNow: Boolean(watchNowBtn),
          hasLibraryTrigger: Boolean(libraryBtn),
          hasImdbLink: Boolean(imdbLink),
          imdbHref: imdbLink?.href || null,
          hasScore: Boolean(scoreBadge),
        };
      })()
    `);

    console.log(`  Rendered Title:       ${pageData.title}`);
    console.log(`  Logo Found:           ${pageData.hasLogoImg ? pageData.logoSrc : 'None (Rendered Title Typography)'}`);
    console.log(`  Backdrop Image:       ${pageData.backdropSrc ? pageData.backdropSrc.slice(0, 75) + '...' : 'Missing'}`);
    console.log(`  Poster Image:         ${pageData.posterSrc ? pageData.posterSrc.slice(0, 75) + '...' : 'Missing'}`);
    console.log(`  Trailer Iframe:       ${pageData.hasTrailerIframe ? pageData.trailerSrc.slice(0, 75) + '...' : 'None'}`);
    console.log(`  IMDb Link:            ${pageData.hasImdbLink ? pageData.imdbHref : 'None'}`);
    console.log(`  Interactive Buttons:  WatchNow=${pageData.hasWatchNow}, Library=${pageData.hasLibraryTrigger}`);

    let passed = true;

    // Verify logo expectations
    if (testCase.hasLogo && !pageData.hasLogoImg) {
      console.error(`  FAIL: Expected TMDB logo image for ${testCase.name}`);
      passed = false;
    }
    if (!testCase.hasLogo && pageData.hasLogoImg) {
      console.error(`  FAIL: Expected fallback title typography (no logo) for ${testCase.name}`);
      passed = false;
    }

    // Verify backdrop & poster presence
    if (!pageData.hasBackdrop || !pageData.hasPoster) {
      console.error(`  FAIL: Missing backdrop or poster`);
      passed = false;
    }

    // Verify trailer iframe presence
    if (testCase.hasTrailer && !pageData.hasTrailerIframe) {
      console.error(`  FAIL: Expected trailer iframe to be injected`);
      passed = false;
    }

    if (passed) {
      console.log(`  STATUS: PASSED (Desktop Viewport)`);
    } else {
      allPassed = false;
    }
  }

  // Mobile Viewport Verification (iPhone standard 375x812)
  console.log('\n--- [MOBILE AUDIT] Testing One Piece on Mobile (375x812) ---');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 812,
    deviceScaleFactor: 2,
    mobile: true,
  });

  await cdp.send('Page.navigate', { url: 'http://localhost:4173/anime/21' });
  await wait(2000);

  const mobileMetrics = await cdp.eval(`
    (() => {
      const scrollWidth = document.documentElement.scrollWidth;
      const innerWidth = window.innerWidth;
      const logo = document.querySelector('img.spot-logo');
      const poster = document.querySelector('.detail-poster img');
      const watchBtn = document.querySelector('a[href*="ep="]');
      return {
        hasOverflow: scrollWidth > innerWidth,
        scrollWidth,
        innerWidth,
        logoVisible: Boolean(logo && logo.offsetWidth > 0),
        posterVisible: Boolean(poster && poster.offsetWidth > 0),
        watchBtnVisible: Boolean(watchBtn && watchBtn.offsetWidth > 0),
      };
    })()
  `);

  console.log(`  Horizontal Overflow:   ${mobileMetrics.hasOverflow ? 'FAIL (Overflow detected)' : 'PASSED (0 overflow)'}`);
  console.log(`  Logo Visible:          ${mobileMetrics.logoVisible}`);
  console.log(`  Poster Visible:        ${mobileMetrics.posterVisible}`);
  console.log(`  Watch Now Button:      ${mobileMetrics.watchBtnVisible}`);

  if (mobileMetrics.hasOverflow) {
    allPassed = false;
  }

  console.log(`\n  Total Uncaught Browser Errors: ${cdp.consoleErrors.length}`);

  console.log('\n===============================================================');
  console.log(`   PHASE 3 BROWSER AUDIT: ${allPassed ? 'ALL TESTS PASSED (100%)' : 'SOME TESTS FAILED'}`);
  console.log('===============================================================\n');

  ws.close();
  if (!allPassed) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
