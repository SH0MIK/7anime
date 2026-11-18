/**
 * Phase 2 Comprehensive Verification Test Suite
 * Tests AniList + TMDB Provider Integration & Normalization.
 */

const API_BASE = 'http://localhost:5000/api';

const TEST_CASES = [
  { id: 21, name: 'One Piece', expectedFormat: 'TV', expectedTmdbId: 37854 },
  { id: 20, name: 'Naruto', expectedFormat: 'TV', expectedTmdbId: 46260 },
  { id: 1735, name: 'Naruto Shippuden', expectedFormat: 'TV', expectedTmdbId: 31910 },
  { id: 21175, name: 'Dragon Ball Super', expectedFormat: 'TV', expectedTmdbId: 62710 },
  { id: 21519, name: 'Your Name (Kimi no Na wa)', expectedFormat: 'MOVIE', expectedTmdbId: 372058 },
  { id: 5365, name: 'Tsumiki no Ie (La Maison en Petits Cubes)', expectedFormat: 'MOVIE', isObscure: true },
];

async function runTests() {
  console.log('===============================================================');
  console.log('   7ANIME_NEW — PHASE 2: ANILIST + TMDB INTEGRATION TEST SUITE ');
  console.log('===============================================================\n');

  const results = [];
  let allPassed = true;

  for (const testCase of TEST_CASES) {
    console.log(`\n--- [TEST] Testing AniList ID ${testCase.id}: ${testCase.name} ---`);
    const startTime = Date.now();

    try {
      // 1. Fetch Anime Details
      const detailsRes = await fetch(`${API_BASE}/anime/${testCase.id}`);
      if (!detailsRes.ok) {
        throw new Error(`Failed to fetch details: HTTP ${detailsRes.status} ${detailsRes.statusMessage}`);
      }
      const detailsData = await detailsRes.json();
      const anime = detailsData.data;

      // 2. Fetch Anime Artwork
      const artworkRes = await fetch(`${API_BASE}/anime/${testCase.id}/artwork`);
      if (!artworkRes.ok) {
        throw new Error(`Failed to fetch artwork: HTTP ${artworkRes.status}`);
      }
      const artworkData = await artworkRes.json();
      const artwork = artworkData.data;

      const durationMs = Date.now() - startTime;

      // Assertions
      const hasTitle = Boolean(anime.titles.romaji || anime.titles.english);
      const hasDescription = Boolean(anime.description && anime.description.length > 10);
      const hasGenres = Array.isArray(anime.genres) && anime.genres.length > 0;
      const hasRatings = Boolean(anime.ratings.anilist || anime.ratings.tmdb);
      const hasSources = anime.metadataSources.includes('anilist');

      const tmdbMatched = anime.metadataSources.includes('tmdb');
      const hasLogo = Boolean(anime.artwork.logo);
      const hasBackdrop = Boolean(anime.artwork.backdrop);
      const hasPoster = Boolean(anime.artwork.poster);
      const hasTrailer = Boolean(anime.trailer?.url);

      const caseResult = {
        id: testCase.id,
        name: testCase.name,
        durationMs,
        titles: anime.titles,
        format: anime.format,
        status: anime.status,
        episodes: anime.episodes,
        ratings: anime.ratings,
        externalIds: anime.externalIds,
        sources: anime.metadataSources,
        artwork: {
          logo: anime.artwork.logo,
          logoSource: artwork.logoSource,
          backdrop: anime.artwork.backdrop,
          backdropSource: artwork.backdropSource,
          poster: anime.artwork.poster,
          posterSource: artwork.posterSource,
        },
        trailer: anime.trailer,
        checks: {
          hasTitle,
          hasDescription,
          hasGenres,
          hasRatings,
          hasSources,
          tmdbMatched,
          hasLogo,
          hasBackdrop,
          hasPoster,
          hasTrailer,
        },
        passed: false,
      };

      if (!testCase.isObscure) {
        // Strict checks for prominent anime
        const tmdbIdCorrect = anime.externalIds.tmdbId === testCase.expectedTmdbId;
        const imdbIdPresent = Boolean(anime.externalIds.imdbId);
        caseResult.checks.tmdbIdCorrect = tmdbIdCorrect;
        caseResult.checks.imdbIdPresent = imdbIdPresent;

        caseResult.passed =
          hasTitle &&
          hasDescription &&
          tmdbMatched &&
          tmdbIdCorrect &&
          hasLogo &&
          hasBackdrop &&
          hasPoster;
      } else {
        // Obscure anime checks graceful fallback
        const handledGracefully =
          hasTitle && hasPoster && (artwork.logoSource === 'none' || Boolean(anime.artwork.logo));
        caseResult.checks.handledGracefully = handledGracefully;
        caseResult.passed = handledGracefully;
      }

      if (!caseResult.passed) {
        allPassed = false;
      }

      console.log(`Title (Romaji):   ${anime.titles.romaji}`);
      console.log(`Title (English):  ${anime.titles.english || 'N/A'}`);
      console.log(`Format / Status:  ${anime.format} / ${anime.status}`);
      console.log(`Episodes:         ${anime.episodes || 'N/A'}`);
      console.log(`Ratings:          AniList: ${anime.ratings.anilist || 'N/A'} | TMDB: ${anime.ratings.tmdb || 'N/A'}`);
      console.log(`External IDs:     AniList: ${anime.externalIds.anilistId} | TMDB: ${anime.externalIds.tmdbId || 'None'} | IMDb: ${anime.externalIds.imdbId || 'None'}`);
      console.log(`Metadata Sources: ${anime.metadataSources.join(', ')}`);
      console.log(`Logo URL:         ${anime.artwork.logo ? anime.artwork.logo : '(None - Graceful Fallback)'}`);
      console.log(`Backdrop URL:     ${anime.artwork.backdrop ? anime.artwork.backdrop.slice(0, 70) + '...' : 'None'}`);
      console.log(`Poster URL:       ${anime.artwork.poster ? anime.artwork.poster.slice(0, 70) + '...' : 'None'}`);
      console.log(`Trailer:          ${anime.trailer ? `${anime.trailer.site} (${anime.trailer.key}) - ${anime.trailer.url}` : 'None'}`);
      console.log(`Result:           ${caseResult.passed ? 'PASSED' : 'FAILED'} (${durationMs}ms)`);

      results.push(caseResult);
    } catch (err) {
      console.error(`ERROR running test for ${testCase.name}:`, err.message);
      results.push({
        id: testCase.id,
        name: testCase.name,
        error: err.message,
        passed: false,
      });
      allPassed = false;
    }
  }

  // 3. Test Search Endpoint
  console.log('\n--- [TEST] Testing Search Endpoint: GET /api/anime/search?q=Demon%20Slayer ---');
  try {
    const searchRes = await fetch(`${API_BASE}/anime/search?q=Demon%20Slayer&limit=5`);
    const searchData = await searchRes.json();
    const searchItems = searchData.data?.items || [];
    console.log(`Search items returned: ${searchItems.length} (Total matches: ${searchData.data?.total})`);
    if (searchItems.length > 0) {
      const first = searchItems[0];
      console.log(`First result: ${first.titles.english || first.titles.romaji} (AniList ID: ${first.id})`);
      console.log(`First result logo: ${first.artwork.logo || 'None'}`);
      console.log(`First result backdrop: ${first.artwork.backdrop ? first.artwork.backdrop.slice(0, 60) + '...' : 'None'}`);
    }
  } catch (err) {
    console.error('Search test error:', err.message);
    allPassed = false;
  }

  // 4. Test Trending Endpoint
  console.log('\n--- [TEST] Testing Trending Endpoint: GET /api/anime/trending?limit=3 ---');
  try {
    const trendRes = await fetch(`${API_BASE}/anime/trending?limit=3`);
    const trendData = await trendRes.json();
    const trendItems = trendData.data || [];
    console.log(`Trending items returned: ${trendItems.length}`);
    trendItems.forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.titles.english || item.titles.romaji} (${item.format}) - Sources: ${item.metadataSources.join('+')}`);
    });
  } catch (err) {
    console.error('Trending test error:', err.message);
  }

  console.log('\n===============================================================');
  console.log(`   PHASE 2 VERIFICATION OVERALL: ${allPassed ? 'ALL TESTS PASSED (100%)' : 'SOME TESTS FAILED'}`);
  console.log('===============================================================\n');

  return { allPassed, results };
}

runTests().then((res) => {
  if (!res.allPassed) {
    process.exit(1);
  }
});
