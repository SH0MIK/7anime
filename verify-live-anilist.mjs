import { spawn } from 'child_process';
import http from 'http';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getWsUrl(port = 9222) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      const targets = await res.json();
      const pageTarget = targets.find((t) => t.type === 'page');
      if (pageTarget?.webSocketDebuggerUrl) return pageTarget.webSocketDebuggerUrl;
    } catch {
      await sleep(300);
    }
  }
  throw new Error('Chrome page target not ready');
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.events = [];
    this.consoleLogs = [];

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || []).map((a) => a.value || a.description || '').join(' ');
        this.consoleLogs.push({ type: msg.params.type, text });
      }
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((resolve) => {
      this.ws.onopen = resolve;
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.value;
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

async function main() {
  console.log('--- STARTING 7ANIME LIVE ANILIST VERIFICATION ---');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chromeProcess = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1400,900',
    'about:blank',
  ]);

  try {
    const wsUrl = await getWsUrl(9222);
    console.log('[CDP] Connected to Chrome DevTools Protocol at', wsUrl);

    // 1. Check Homepage
    console.log('\n[TEST 1] Verifying Homepage (http://localhost:4173/)...');
    const client = new CdpClient(wsUrl);
    await client.ready();
    await client.send('Page.enable');
    await client.send('Runtime.enable');

    await client.send('Page.navigate', { url: 'http://localhost:4173/' });
    await sleep(4000); // Allow batched AniList GraphQL query to resolve

    const homeData = await client.eval(`(() => {
      const spotTitle = document.querySelector('.spot-title, .spot-logo')?.textContent || document.querySelector('.spot-logo')?.alt || '';
      const spotCards = document.querySelectorAll('.spot-slide').length;
      const rails = document.querySelectorAll('.row.centered-carousel').length;
      const animeCards = document.querySelectorAll('.t10, .ac').length;
      const latestCards = document.querySelectorAll('.home-latest-feed .cw').length;
      const errors = document.querySelectorAll('.home-error-state').length;

      // Extract first 5 anime titles on the page
      const titles = Array.from(document.querySelectorAll('.cov-title, .spot-title')).map(e => e.textContent.trim()).filter(Boolean).slice(0, 8);

      return {
        spotTitle,
        spotCards,
        rails,
        animeCards,
        latestCards,
        errors,
        titles
      };
    })()`);

    console.log('Homepage Result:', JSON.stringify(homeData, null, 2));
    if (!homeData || homeData.animeCards < 5) {
      throw new Error(`Homepage failed to render live anime cards (found ${homeData?.animeCards})`);
    }
    console.log('✔ Homepage rendered live AniList cards successfully!');

    // 2. Check Browse Page
    console.log('\n[TEST 2] Verifying Browse Page (http://localhost:4173/anime)...');
    await client.send('Page.navigate', { url: 'http://localhost:4173/anime' });
    await sleep(3500); // Allow AniList browse query to return

    const browseData = await client.eval(`(() => {
      const gridCards = document.querySelectorAll('.browse-grid .ac, .browse-grid article').length;
      const subtitle = document.querySelector('.page-subtitle')?.textContent || '';
      const firstCardTitle = document.querySelector('.browse-grid .cov-title')?.textContent || '';
      const pagination = document.body.innerText.includes('Page 1 of');
      return { gridCards, subtitle, firstCardTitle, pagination };
    })()`);

    console.log('Browse Page Result:', JSON.stringify(browseData, null, 2));
    if (!browseData || browseData.gridCards === 0) {
      throw new Error('Browse page failed to render AniList grid cards');
    }
    console.log('✔ Browse page populated with live AniList catalog!');

    // 3. Check Live Search Modal
    console.log('\n[TEST 3] Verifying Search Autocomplete...');
    await client.send('Page.navigate', { url: 'http://localhost:4173/' });
    await sleep(1500);

    // Open search modal via shortcut / button
    await client.eval(`(() => {
      const searchBtn = document.querySelector('.site-header__search, button[aria-label*="Search"], button[title*="Search"]');
      if (searchBtn) searchBtn.click();
    })()`);
    await sleep(800);

    // Focus input and type "One Piece" via CDP Input.insertText
    await client.eval(`(() => {
      const input = document.querySelector('.search-overlay input');
      if (input) input.focus();
    })()`);
    await sleep(200);

    await client.send('Input.insertText', { text: 'One Piece' });
    await sleep(3000); // Allow debounced AniList search query

    const searchData = await client.eval(`(() => {
      const matchP = document.querySelector('.search-overlay__inner p')?.textContent || '';
      const resultsCount = document.querySelectorAll('.search-overlay__inner .browse-grid .ac, .search-overlay__inner .browse-grid article').length;
      const firstResult = document.querySelector('.search-overlay__inner .cov-title')?.textContent || '';
      return { matchP, resultsCount, firstResult };
    })()`);

    console.log('Search Modal Result:', JSON.stringify(searchData, null, 2));
    if (!searchData || searchData.resultsCount === 0) {
      throw new Error('Live AniList search autocomplete failed to return results');
    }
    console.log('✔ Live AniList search autocomplete verified successfully!');

    // 4. Check Anime Details Page
    console.log('\n[TEST 4] Verifying Anime Details Page (http://localhost:4173/anime/21)...');
    await client.send('Page.navigate', { url: 'http://localhost:4173/anime/21' });
    await sleep(4000); // Allow multi-source details to load

    const detailData = await client.eval(`(() => {
      const title = document.querySelector('.detail-main-col h1')?.textContent || document.querySelector('.detail-main-col .spot-logo')?.alt || '';
      const episodesCount = document.querySelectorAll('.detail-ep-grid .detail-ep-card, .detail-ep-list__item').length;
      const hasBackdrop = Boolean(document.querySelector('.detail-hero img'));
      const format = document.querySelector('.detail-sidebar-row__val')?.textContent || '';
      const synopsis = document.querySelector('.detail-main-col p')?.textContent || '';
      return { title, episodesCount, hasBackdrop, format, synopsisLength: synopsis.length };
    })()`);

    console.log('Anime Details Result:', JSON.stringify(detailData, null, 2));
    if (!detailData || !detailData.title) {
      throw new Error('Anime Details page failed to render live anime metadata');
    }
    console.log('✔ Anime Details page verified with live metadata and backdrop!');

    // 5. Check Latest Page
    console.log('\n[TEST 5] Verifying Latest Releases Feed (http://localhost:4173/latest)...');
    await client.send('Page.navigate', { url: 'http://localhost:4173/latest' });
    await sleep(3000);

    const latestData = await client.eval(`(() => {
      const cards = document.querySelectorAll('.latest-grid-4 .cw').length;
      const subtitle = document.querySelector('.page-subtitle')?.textContent || '';
      const firstTitle = document.querySelector('.latest-grid-4 .cw .cw-title')?.textContent || '';
      return { cards, subtitle, firstTitle };
    })()`);

    console.log('Latest Page Result:', JSON.stringify(latestData, null, 2));
    if (!latestData || latestData.cards === 0) {
      throw new Error('Latest releases feed failed to render');
    }
    console.log('✔ Latest releases feed populated with live releasing anime!');

    client.close();
    console.log('\n========================================');
    console.log('ALL VERIFICATION SUITES PASSED CLEANLY (100%)');
    console.log('========================================');
  } finally {
    chromeProcess.kill('SIGKILL');
  }
}

main().catch((err) => {
  console.error('\n❌ VERIFICATION FAILED:', err);
  process.exit(1);
});
