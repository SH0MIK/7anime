const puppeteer = require('E:/7ANIME_CODEX/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/BHIMANI/.gemini/antigravity/brain/68b7b3c6-48cd-47d4-be24-a113e17d0808';

async function runBrowserTests() {
  console.log('====================================================');
  console.log('7ANIME — BROWSER & TMDB TRANSPARENT LOGO VERIFICATION');
  console.log('====================================================\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: Homepage Hero Spotlight TMDB Logo
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Homepage Hero Spotlight TMDB Transparent Logo ---');
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle2', timeout: 25000 });

  // Wait for spotlight logo to resolve and render
  await page.waitForSelector('.spot-copy img.spot-logo', { timeout: 12000 });

  const spotlightLogo = await page.$('.spot-copy img.spot-logo');
  let spotlightLogoSrc = null;
  if (spotlightLogo) {
    spotlightLogoSrc = await page.evaluate(el => el.getAttribute('src'), spotlightLogo);
  }

  assert(
    spotlightLogoSrc !== null && spotlightLogoSrc.includes('image.tmdb.org/t/p/'),
    `Homepage spotlight displays authentic TMDB transparent logo: ${spotlightLogoSrc}`
  );

  const shot1Path = path.join(ARTIFACT_DIR, 'screenshot_homepage_spotlight_tmdb_logo.png');
  await page.screenshot({ path: shot1Path, fullPage: false });
  console.log(`Saved screenshot to: ${shot1Path}`);

  // --------------------------------------------------------------------------
  // TEST 2: Anime Details Page — One Piece (AniList 21)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Anime Details Hero Logo — One Piece (21) ---');
  await page.goto('http://localhost:4173/anime/one-piece-21', { waitUntil: 'networkidle2', timeout: 25000 });
  await page.waitForSelector('.detail-main-col img.spot-logo', { timeout: 12000 });

  const opLogoEl = await page.$('.detail-main-col img.spot-logo');
  let opLogoSrc = null;
  if (opLogoEl) {
    opLogoSrc = await page.evaluate(el => el.getAttribute('src'), opLogoEl);
  }

  assert(
    opLogoSrc === 'https://image.tmdb.org/t/p/original/9F7daAmibx8ZHTE17CdM5FAwiHE.png',
    `One Piece details hero renders verified TMDB logo: ${opLogoSrc}`
  );

  // Check Trailer Muted button is NOT present
  const trailerMutedBtn = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).some(b =>
      b.textContent && b.textContent.includes('Trailer Muted')
    );
  });
  assert(!trailerMutedBtn, '"Trailer Muted" button is completely absent from DOM');

  const shot2Path = path.join(ARTIFACT_DIR, 'screenshot_anime_details_one_piece_logo.png');
  await page.screenshot({ path: shot2Path, fullPage: false });
  console.log(`Saved screenshot to: ${shot2Path}`);

  // --------------------------------------------------------------------------
  // TEST 3: Anime Details Page — Naruto Shippuden (AniList 1735)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Anime Details Hero Logo — Naruto Shippuden (1735) ---');
  await page.goto('http://localhost:4173/anime/1735', { waitUntil: 'networkidle2', timeout: 25000 });
  await page.waitForSelector('.detail-main-col img.spot-logo', { timeout: 12000 });

  const nsLogoEl = await page.$('.detail-main-col img.spot-logo');
  let nsLogoSrc = null;
  if (nsLogoEl) {
    nsLogoSrc = await page.evaluate(el => el.getAttribute('src'), nsLogoEl);
  }

  assert(
    nsLogoSrc === 'https://image.tmdb.org/t/p/original/qopvxH4C4YIoeJWss0EVLv13rgW.png',
    `Naruto Shippuden details hero renders verified TMDB logo: ${nsLogoSrc}`
  );

  const shot3Path = path.join(ARTIFACT_DIR, 'screenshot_anime_details_naruto_shippuden_logo.png');
  await page.screenshot({ path: shot3Path, fullPage: false });
  console.log(`Saved screenshot to: ${shot3Path}`);

  // --------------------------------------------------------------------------
  // TEST 4: Anime Details Page — Dragon Ball Super (AniList 21175)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Anime Details Hero Logo — Dragon Ball Super (21175) ---');
  await page.goto('http://localhost:4173/anime/21175', { waitUntil: 'networkidle2', timeout: 25000 });
  await page.waitForSelector('.detail-main-col img.spot-logo', { timeout: 12000 });

  const dbsLogoEl = await page.$('.detail-main-col img.spot-logo');
  let dbsLogoSrc = null;
  if (dbsLogoEl) {
    dbsLogoSrc = await page.evaluate(el => el.getAttribute('src'), dbsLogoEl);
  }

  assert(
    dbsLogoSrc === 'https://image.tmdb.org/t/p/original/jFbAJvkTpHN2CU6lvMIShKzLqO1.png',
    `Dragon Ball Super details hero renders verified TMDB logo: ${dbsLogoSrc}`
  );

  const shot4Path = path.join(ARTIFACT_DIR, 'screenshot_anime_details_dragon_ball_super_logo.png');
  await page.screenshot({ path: shot4Path, fullPage: false });
  console.log(`Saved screenshot to: ${shot4Path}`);

  // --------------------------------------------------------------------------
  // TEST 5: Typography Fallback Heading when TMDB Logo is Missing
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Typography Fallback Heading when Logo is Absent ---');
  // Anime 195604 (Black Clover Season 2 - valid AniList anime, verified no TMDB logo)
  await page.goto('http://localhost:4173/anime/195604', { waitUntil: 'networkidle2', timeout: 25000 });
  await page.waitForSelector('.detail-main-col h1', { timeout: 12000 });

  const hasH1 = await page.$('.detail-main-col h1');
  const h1Text = hasH1 ? await page.evaluate(el => el.textContent, hasH1) : null;
  const fallbackImg = await page.$('.detail-main-col img.spot-logo');

  assert(
    hasH1 !== null && h1Text && h1Text.includes('Black Clover'),
    `Fallback typography heading <h1> rendered cleanly: "${h1Text}"`
  );
  assert(
    fallbackImg === null,
    'No broken or fake <img> element rendered for anime without TMDB logo'
  );

  const shot5Path = path.join(ARTIFACT_DIR, 'screenshot_anime_details_typography_fallback.png');
  await page.screenshot({ path: shot5Path, fullPage: false });
  console.log(`Saved screenshot to: ${shot5Path}`);

  await browser.close();

  console.log('\n====================================================');
  console.log(`BROWSER VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runBrowserTests().catch(err => {
  console.error('Browser test run failed:', err);
  process.exit(1);
});
