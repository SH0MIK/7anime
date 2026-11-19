import { config } from './dist/config/env.js';
import { MalProvider } from './dist/services/metadata/providers/mal.provider.js';
import { AniListProvider } from './dist/services/metadata/providers/anilist.provider.js';
import { TmdbProvider } from './dist/services/metadata/providers/tmdb.provider.js';
import { AnimeResolverService } from './dist/services/metadata/resolver/anime-resolver.service.js';
import { ExternalIdResolverService } from './dist/services/metadata/resolver/external-id-resolver.service.js';
import { malBreaker } from './dist/services/metadata/resolver/circuit-breaker.service.js';
import { HttpClient } from './dist/utils/httpClient.js';

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

async function runMalTestSuite() {
  console.log('================================================================');
  console.log('      7ANIME MYANIMELIST (MAL) API v2 INTEGRATION TEST SUITE    ');
  console.log('================================================================\n');

  // 1. MAL Credential Detection
  console.log('--- TEST GROUP 1: MAL Credential Detection & Honest State ---');
  const hasMalId = Boolean(config.malClientId && config.malClientId.length > 5);
  assert(MalProvider.isConfigured() === hasMalId, `MalProvider.isConfigured() accurately reports credential state (${hasMalId})`);
  if (!hasMalId) {
    console.log('ℹ️  MAL_CLIENT_ID is currently unconfigured in .env. Checking graceful fallback behavior...');
  } else {
    console.log('ℹ️  MAL_CLIENT_ID is configured.');
  }

  // 2. Official MAL API v2 Network Reachability & Auth Header Contract
  console.log('\n--- TEST GROUP 2: Official MAL API v2 Reachability & Contract ---');
  try {
    // Ping public MAL endpoint with dummy/test ID to verify official API v2 responds
    await HttpClient.get('https://api.myanimelist.net/v2/anime/21?fields=id,title', {
      headers: { 'X-MAL-CLIENT-ID': config.malClientId || 'probe_contract_check' },
      timeoutMs: 8000,
    });
    assert(true, 'Official MAL API v2 responded with HTTP 200 (Valid credentials)');
  } catch (err) {
    const isExpectedMalResponse = err.message.includes('400') || err.message.includes('Invalid client id') || err.message.includes('401');
    assert(
      isExpectedMalResponse,
      `Official MAL API v2 responded with authentic protocol error: ${err.message}`
    );
  }

  // 3. Graceful Behavior with Missing Credentials
  console.log('\n--- TEST GROUP 3: Graceful Degradation Without Credentials ---');
  if (!hasMalId) {
    const details = await MalProvider.getAnimeById(21);
    assert(details === null, 'MalProvider.getAnimeById() returns null safely without throwing when unconfigured');

    const search = await MalProvider.searchAnime('One Piece');
    assert(Array.isArray(search) && search.length === 0, 'MalProvider.searchAnime() returns empty array safely without throwing when unconfigured');
  } else {
    const details = await MalProvider.getAnimeById(21);
    assert(details !== null && details.id === 21, `MalProvider.getAnimeById(21) retrieved ${details?.title}`);

    const search = await MalProvider.searchAnime('One Piece', 5);
    assert(Array.isArray(search) && search.length > 0, `MalProvider.searchAnime('One Piece') found ${search.length} records`);
  }

  // 4. MAL ID Mapping & Cross-Provider Normalization
  console.log('\n--- TEST GROUP 4: MAL ID Mapping from AniList ---');
  const onePieceExt = await ExternalIdResolverService.resolve(21);
  assert(onePieceExt?.malId === 21, `One Piece AniList ID 21 maps to MAL ID 21 (resolved: ${onePieceExt?.malId})`);

  const bleachExt = await ExternalIdResolverService.resolve(269);
  assert(bleachExt?.malId === 269, `Bleach AniList ID 269 maps to MAL ID 269 (resolved: ${bleachExt?.malId})`);

  const frierenExt = await ExternalIdResolverService.resolve(154587);
  assert(frierenExt?.malId === 52991, `Frieren AniList ID 154587 maps to MAL ID 52991 (resolved: ${frierenExt?.malId})`);

  // 5. Response Normalization Integrity
  console.log('\n--- TEST GROUP 5: MAL Response Normalization ---');
  const mockMalPayload = {
    id: 52991,
    title: 'Sousou no Frieren',
    alternative_titles: {
      synonyms: ['Frieren at the Funeral'],
      en: 'Frieren: Beyond Journey\'s End',
      ja: '葬送のフリーレン'
    },
    main_picture: {
      medium: 'https://cdn.myanimelist.net/images/anime/1015/138006.jpg',
      large: 'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg'
    },
    synopsis: 'During their decade-long quest...',
    mean: 9.32,
    rank: 1,
    popularity: 150,
    num_episodes: 28,
    status: 'finished_airing',
    genres: [{ id: 10, name: 'Fantasy' }, { id: 2, name: 'Adventure' }],
    media_type: 'tv',
  };

  const resolvedMock = await AnimeResolverService.resolveFromMal(154587, MalProvider['normalizeMalResponse'](mockMalPayload), frierenExt);
  assert(resolvedMock.id === '154587', 'Preserves AniList ID 154587 as canonical entity ID');
  assert(resolvedMock.externalIds.malId === 52991, 'Attaches MAL ID 52991 in externalIds');
  assert(resolvedMock.titles.english === 'Frieren: Beyond Journey\'s End', 'Normalized English title from alternative_titles.en');
  assert(resolvedMock.ratings.mal === 9.3, 'Normalized MAL mean score to 1 decimal place (9.3)');
  assert(resolvedMock.metadataSources.includes('mal'), 'metadataSources includes mal');

  // 6. Failover & Circuit Breaker Robustness
  console.log('\n--- TEST GROUP 6: Circuit Breaker State & Fallback ---');
  const breakerStatus = malBreaker.getStatus();
  assert(breakerStatus.name === 'MyAnimeList', 'MAL Circuit breaker name is MyAnimeList');
  assert(breakerStatus.state === 'CLOSED', 'MAL Circuit breaker initialized in healthy CLOSED state');

  // 7. Regression Tests: AniList Primary & TMDB Artwork Intact
  console.log('\n--- TEST GROUP 7: AniList Primary & TMDB Regression ---');
  const anilistOnePiece = await AniListProvider.getAnimeById(21);
  assert(anilistOnePiece !== null && anilistOnePiece.id === 21, 'AniList primary provider successfully resolves One Piece');

  const tmdbDetails = await TmdbProvider.getTvDetails(37854);
  assert(tmdbDetails !== null && tmdbDetails.name === 'One Piece', 'TMDB provider resolves One Piece TV metadata');

  const fullResolved = await AnimeResolverService.resolveById(21);
  assert(fullResolved !== null && fullResolved.id === '21', 'AnimeResolverService.resolveById(21) returns complete resolved anime');
  assert(fullResolved?.metadataSources.includes('anilist'), 'Primary metadata source remains AniList');

  // Summary
  console.log('\n================================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runMalTestSuite().catch((err) => {
  console.error('Fatal MAL test error:', err);
  process.exit(1);
});
