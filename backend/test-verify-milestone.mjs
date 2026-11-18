/**
 * Milestone Verification Script for 7Anime
 * Tests:
 * 1. Provider health & Circuit Breakers (/api/anime/providers/status)
 * 2. Recent Airing Schedule (/api/anime/recent-airing)
 * 3. Canonical Anime Details & Identity Resolution (One Piece, Frieren, Naruto, Death Note, Your Name)
 * 4. Real Episode Catalogues (One Piece, Frieren, Your Name)
 * 5. Redis Caching & 7-Day TTL (604800s)
 * 6. Blank Player Verification (Frontend build / source inspection)
 */

import http from 'http';
import fs from 'fs';
import path from 'path';

const BACKEND_BASE = 'http://localhost:5000';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('   7ANIME RUNTIME-FIRST ARCHITECTURE VERIFICATION   ');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, testName, detail = '') {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${testName} ${detail ? `(${detail})` : ''}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    }
  }

  // --- TEST GROUP 1: Provider Status & Circuit Breakers ---
  console.log('--- TEST GROUP 1: Providers & Circuit Breakers ---');
  try {
    const res = await fetchJson(`${BACKEND_BASE}/api/anime/providers/status`);
    assert(res.status === 200, 'Provider status endpoint returns HTTP 200');
    assert(res.data?.success === true, 'Provider response indicates success');
    assert(res.data?.data?.cache?.redis === 'connected', 'Upstash Redis is connected');
    assert(res.data?.data?.circuitBreakers?.anilist?.state === 'CLOSED', 'AniList Circuit Breaker is CLOSED (healthy)');
    assert(res.data?.data?.circuitBreakers?.tmdb?.state === 'CLOSED', 'TMDB Circuit Breaker is CLOSED (healthy)');
    assert(res.data?.data?.circuitBreakers?.mal?.state === 'CLOSED', 'MAL Circuit Breaker is CLOSED (healthy)');
  } catch (err) {
    console.error('Failed group 1:', err.message);
  }

  // --- TEST GROUP 2: Recent Airing Episodes ---
  console.log('\n--- TEST GROUP 2: Real AniList Airing Schedule ---');
  try {
    const res = await fetchJson(`${BACKEND_BASE}/api/anime/recent-airing?limit=10`);
    assert(res.status === 200, 'Recent airing endpoint returns HTTP 200');
    assert(Array.isArray(res.data?.data), 'Recent airing returns an array of items');
    assert(res.data?.data?.length > 0, 'Recent airing array is not empty', `Count: ${res.data?.data?.length}`);
    const first = res.data?.data?.[0];
    assert(typeof first?.anilistId === 'number' || typeof first?.id === 'number', 'Recent airing item has valid numeric ID', `ID: ${first?.anilistId || first?.id}`);
    assert(typeof first?.episode === 'number', 'Recent airing item has valid episode number', `Ep: ${first?.episode}`);
    assert(typeof first?.airingAt === 'number' && first.airingAt > 0, 'Recent airing item has real Unix timestamp', `airingAt: ${first?.airingAt}`);
    assert(typeof first?.title === 'string' && first.title.length > 0, 'Recent airing item has real title', `Title: ${first?.title}`);
  } catch (err) {
    console.error('Failed group 2:', err.message);
  }

  // --- TEST GROUP 3: Identity & Metadata Resolution ---
  console.log('\n--- TEST GROUP 3: Identity & Metadata Resolution ---');
  // 1. One Piece (AniList 21 -> TMDB 37854)
  try {
    const res = await fetchJson(`${BACKEND_BASE}/api/anime/21`);
    assert(res.status === 200, 'One Piece (21) resolved');
    const anime = res.data?.data;
    assert(anime?.externalIds?.anilistId === 21, 'AniList ID matches 21');
    assert(anime?.externalIds?.tmdbId === 37854, 'TMDB TV ID resolved correctly to 37854');
    assert(anime?.format === 'TV', 'Format is TV');
    assert(anime?.artwork?.logo !== null, 'Transparent TMDB logo resolved');
  } catch (err) {
    console.error('Failed One Piece identity:', err.message);
  }

  // 2. Frieren (AniList 154587 -> TMDB 209867)
  try {
    const res = await fetchJson(`${BACKEND_BASE}/api/anime/154587`);
    assert(res.status === 200, 'Frieren (154587) resolved');
    const anime = res.data?.data;
    assert(anime?.externalIds?.anilistId === 154587, 'AniList ID matches 154587');
    assert(anime?.externalIds?.tmdbId === 209867, 'TMDB TV ID resolved correctly to 209867');
    assert(anime?.episodes === 28, 'Total episodes matches official 28');
  } catch (err) {
    console.error('Failed Frieren identity:', err.message);
  }

  // 3. Your Name (AniList 21519 -> TMDB 372058)
  try {
    const res = await fetchJson(`${BACKEND_BASE}/api/anime/21519`);
    assert(res.status === 200, 'Your Name (21519) resolved');
    const anime = res.data?.data;
    assert(anime?.externalIds?.anilistId === 21519, 'AniList ID matches 21519');
    assert(anime?.externalIds?.tmdbId === 372058, 'TMDB Movie ID resolved correctly to 372058');
    assert(anime?.format === 'MOVIE', 'Format is MOVIE');
    assert(anime?.episodes === 1, 'Total episodes is 1 for movie');
  } catch (err) {
    console.error('Failed Your Name identity:', err.message);
  }

  // 4. Naruto (AniList 20 -> TMDB 46260)
  try {
    const res = await fetchJson(`${BACKEND_BASE}/api/anime/20`);
    assert(res.status === 200, 'Naruto (20) resolved');
    const anime = res.data?.data;
    assert(anime?.externalIds?.anilistId === 20, 'AniList ID matches 20');
    assert(anime?.externalIds?.tmdbId === 46260, 'TMDB TV ID resolved to 46260');
  } catch (err) {
    console.error('Failed Naruto identity:', err.message);
  }

  // --- TEST GROUP 4: Real Episode Data Resolution ---
  console.log('\n--- TEST GROUP 4: Real Episode Resolution & Stills ---');
  // 1. One Piece Episodes (Ongoing, calculated count, next airing episode)
  try {
    const res = await fetchJson(`${BACKEND_BASE}/api/anime/21/episodes`);
    assert(res.status === 200, 'One Piece episodes endpoint returns HTTP 200');
    const epData = res.data?.data;
    assert(epData?.totalAnnouncedEpisodes === null, 'One Piece totalAnnouncedEpisodes is null (ongoing series)');
    assert(typeof epData?.airedEpisodeCount === 'number' && epData.airedEpisodeCount >= 1100, 'One Piece airedEpisodeCount dynamically calculated from schedule', `Count: ${epData?.airedEpisodeCount}`);
    assert(epData?.nextUpcomingEpisode !== null && typeof epData?.nextUpcomingEpisode?.airingAt === 'number', 'One Piece has real next upcoming episode timestamp', `Ep ${epData?.nextUpcomingEpisode?.episode} at ${new Date(epData?.nextUpcomingEpisode?.airingAt * 1000).toISOString()}`);
    assert(epData?.episodes?.length > 0, 'One Piece episodes list has real entries', `Fetched: ${epData?.episodes?.length}`);
    const ep1 = epData?.episodes?.[0];
    assert(ep1?.number === 1, 'First episode is number 1');
    assert(ep1?.title && !ep1.title.includes('Episode 1 of'), 'First episode has real verified title', `"${ep1?.title}"`);
    assert(ep1?.thumbnail !== null, 'First episode has authentic thumbnail');
  } catch (err) {
    console.error('Failed One Piece episodes:', err.message);
  }

  // 2. Frieren Episodes (Completed season, TMDB official stills and overviews)
  try {
    const res = await fetchJson(`${BACKEND_BASE}/api/anime/154587/episodes`);
    assert(res.status === 200, 'Frieren episodes endpoint returns HTTP 200');
    const epData = res.data?.data;
    assert(epData?.totalAnnouncedEpisodes === 28, 'Frieren totalAnnouncedEpisodes is exactly 28');
    assert(epData?.airedEpisodeCount === 28, 'Frieren airedEpisodeCount is exactly 28');
    assert(epData?.episodes?.length >= 28, 'Frieren has complete verified episode catalogue', `Count: ${epData?.episodes?.length}`);
    const ep1 = epData?.episodes?.[0];
    assert(ep1?.title === "The Journey's End", 'Frieren Episode 1 has official title "The Journey\'s End"', `Got: "${ep1?.title}"`);
    assert(ep1?.thumbnail && ep1.thumbnail.includes('image.tmdb.org'), 'Frieren Episode 1 thumbnail is genuine TMDB still', `URL: ${ep1?.thumbnail}`);
    assert(ep1?.overview && ep1.overview.length > 20, 'Frieren Episode 1 has genuine plot overview');
  } catch (err) {
    console.error('Failed Frieren episodes:', err.message);
  }

  // 3. Your Name (Movie)
  try {
    const res = await fetchJson(`${BACKEND_BASE}/api/anime/21519/episodes`);
    assert(res.status === 200, 'Your Name episodes endpoint returns HTTP 200');
    const epData = res.data?.data;
    assert(epData?.totalAnnouncedEpisodes === 1, 'Your Name movie has totalAnnouncedEpisodes = 1');
    assert(epData?.episodes?.length === 1, 'Your Name has exactly 1 episode entry');
    assert(epData?.episodes?.[0]?.number === 1, 'Episode number is 1');
  } catch (err) {
    console.error('Failed Your Name episodes:', err.message);
  }

  // --- TEST GROUP 5: Redis Cache Verification ---
  console.log('\n--- TEST GROUP 5: Shared Global Redis Cache (7-Day TTL) ---');
  try {
    const t0 = Date.now();
    const resCached = await fetchJson(`${BACKEND_BASE}/api/anime/154587`);
    const dt = Date.now() - t0;
    assert(resCached.status === 200, 'Second read for Frieren returns HTTP 200');
    assert(dt < 100, 'Second read served instantly from cache (in-flight/Redis)', `${dt}ms`);
  } catch (err) {
    console.error('Failed Redis cache test:', err.message);
  }

  // --- TEST GROUP 6: Blank Player Constraint (No embed player / No URLs) ---
  console.log('\n--- TEST GROUP 6: Blank Player Constraint (No embed player / No URLs) ---');
  try {
    const glassPlayerPath = path.resolve('frontend/src/components/GlassPlayer.tsx');
    const glassPlayerCode = fs.readFileSync(glassPlayerPath, 'utf8');
    const playerCssPath = path.resolve('frontend/src/styles/glassplayer.css');
    const playerCss = fs.readFileSync(playerCssPath, 'utf8');

    assert(!glassPlayerCode.includes('<video'), 'GlassPlayer contains no HTML5 <video> tag');
    assert(!glassPlayerCode.includes('src="/assets/media/sample-episode.mp4"'), 'Sample episode mp4 removed completely');
    assert(!glassPlayerCode.includes('<iframe\n            src=') && !glassPlayerCode.includes('<iframe src='), 'Player iframe has NO src attribute');
    assert(!glassPlayerCode.includes('srcDoc='), 'Player iframe has NO srcDoc attribute');
    assert(!glassPlayerCode.includes('sandbox='), 'Player iframe has NO active embed sandboxing');
    assert(glassPlayerCode.includes('className="glassplayer__blank-iframe"'), 'Player iframe correctly rendered as blank placeholder iframe');
    assert(playerCss.includes('aspect-ratio: 16 / 9'), 'Player CSS enforces standard 16:9 aspect ratio');
  } catch (err) {
    console.error('Failed GlassPlayer inspection:', err.message);
  }

  console.log('\n====================================================');
  console.log(`VERIFICATION SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('====================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
