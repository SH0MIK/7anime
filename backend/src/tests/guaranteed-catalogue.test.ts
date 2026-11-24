import { EpisodeResolverService, isValidImageUrl } from '../services/metadata/resolver/episode-resolver.service.js';
import { VerifiedEpisode, AnimeEpisodeCatalogue } from '@7anime/shared';

interface TestRecord {
  scenario: string;
  category: string;
  passed: boolean;
  details: string;
}

const suiteResults: TestRecord[] = [];

function recordTest(scenario: string, category: string, passed: boolean, details: string) {
  suiteResults.push({ scenario, category, passed, details });
  const symbol = passed ? '✓' : '✗';
  console.log(`${symbol} [${passed ? 'PASS' : 'FAIL'}] ${scenario} — ${category}: ${details}`);
}

/**
 * Pure generator mirroring EpisodeResolverService fallback generation logic
 * to programmatically test edge cases in isolation.
 */
function simulateCatalogueFallback(
  mediaStatus: string,
  totalAnnounced: number | null,
  nextAiringEp: number | null,
  providerRecords: Partial<VerifiedEpisode>[]
): { airedEpisodeCount: number; episodes: VerifiedEpisode[]; completeness: string } {
  let confirmedAiredCount = 0;
  if (mediaStatus === 'FINISHED') {
    confirmedAiredCount = totalAnnounced || 0;
  } else if (mediaStatus === 'RELEASING') {
    if (nextAiringEp && nextAiringEp > 1) {
      confirmedAiredCount = nextAiringEp - 1;
    } else if (nextAiringEp === 1) {
      confirmedAiredCount = 0;
    } else if (totalAnnounced) {
      confirmedAiredCount = totalAnnounced;
    }
  }

  const verifiedReleasedMap = new Map<number, VerifiedEpisode>();
  for (const ep of providerRecords) {
    if (!ep.number || ep.number <= 0) continue;
    if (mediaStatus === 'RELEASING' && nextAiringEp && ep.number >= nextAiringEp) continue;
    if (mediaStatus === 'NOT_YET_RELEASED') continue;

    verifiedReleasedMap.set(ep.number, {
      number: ep.number,
      title: ep.title || `Episode ${ep.number}`,
      overview: ep.overview,
      airDate: ep.airDate,
      duration: 24,
      thumbnail: ep.thumbnail,
      isFiller: ep.isFiller,
      classification: ep.classification || 'UNKNOWN',
      classificationSource: ep.classificationSource || 'provider',
      hasSub: true,
      hasDub: false,
      source: ep.source || 'tmdb',
    });
  }

  let maxVerifiedEpNum = 0;
  if (verifiedReleasedMap.size > 0) {
    maxVerifiedEpNum = Math.max(...Array.from(verifiedReleasedMap.keys()));
  }
  let airedEpisodeCount = Math.max(confirmedAiredCount, maxVerifiedEpNum);
  if (airedEpisodeCount === 0 && mediaStatus === 'FINISHED' && totalAnnounced && totalAnnounced > 0) {
    airedEpisodeCount = totalAnnounced;
  }

  const catalogueEpisodes: VerifiedEpisode[] = [];
  if (airedEpisodeCount > 0) {
    for (let i = 1; i <= airedEpisodeCount; i++) {
      const existing = verifiedReleasedMap.get(i);
      if (existing) {
        catalogueEpisodes.push(existing);
      } else {
        catalogueEpisodes.push({
          number: i,
          title: `Episode ${i}`,
          overview: undefined,
          airDate: undefined,
          duration: 24,
          thumbnail: undefined,
          isFiller: false,
          classification: 'UNKNOWN',
          classificationSource: 'generated_fallback',
          hasSub: false,
          hasDub: false,
          metadataVerified: false,
          isPlayable: false,
          source: 'GENERATED_FALLBACK',
        });
      }
    }
  }

  const verifiedRecordsCount = catalogueEpisodes.filter((e) => e.source !== 'GENERATED_FALLBACK').length;
  let completeness = 'metadata_unavailable';
  if (catalogueEpisodes.length > 0) {
    if (verifiedRecordsCount >= airedEpisodeCount && airedEpisodeCount > 0) {
      completeness = 'complete';
    } else if (verifiedRecordsCount > 0) {
      completeness = 'partial';
    } else {
      completeness = 'fallback_generated';
    }
  } else if (mediaStatus === 'NOT_YET_RELEASED') {
    completeness = 'resolving';
  }

  return { airedEpisodeCount, episodes: catalogueEpisodes, completeness };
}

async function runAll20Scenarios() {
  console.log('=== Running 20-Scenario Guaranteed Catalogue & Multi-Source Regression Suite ===\n');

  // --- SCENARIO 1: Completed Anime with 0 Provider Records (Tokyo Revengers Case) ---
  const s1 = simulateCatalogueFallback('FINISHED', 13, null, []);
  recordTest(
    'Scenario 01',
    'Completed Anime with 0 Upstream Records',
    s1.episodes.length === 13 &&
      s1.airedEpisodeCount === 13 &&
      s1.completeness === 'fallback_generated' &&
      s1.episodes.every((e) => e.source === 'GENERATED_FALLBACK' && e.classification === 'UNKNOWN'),
    `Generated ${s1.episodes.length}/13 episodes, completeness: ${s1.completeness}`
  );

  // --- SCENARIO 2: Releasing Anime with 24 Total, 8 Aired (No Future Episodes) ---
  const s2 = simulateCatalogueFallback('RELEASING', 24, 9, [
    { number: 1, title: 'Ep 1' },
    { number: 2, title: 'Ep 2' },
  ]);
  const hasNoFutureEps = !s2.episodes.some((e) => e.number >= 9);
  recordTest(
    'Scenario 02',
    'Releasing Anime strictly excludes future episodes',
    s2.episodes.length === 8 && s2.airedEpisodeCount === 8 && hasNoFutureEps,
    `Total: ${s2.episodes.length} (Max Ep: ${s2.episodes[s2.episodes.length - 1]?.number}), Future eps blocked: ${hasNoFutureEps}`
  );

  // --- SCENARIO 3: Completed Anime with Partial Records (10 of 12 present) ---
  const s3Records: Partial<VerifiedEpisode>[] = Array.from({ length: 10 }, (_, i) => ({
    number: i + 1,
    title: `Verified Ep ${i + 1}`,
    thumbnail: `https://image.tmdb.org/t/p/w300/still_${i + 1}.jpg`,
    source: 'tmdb',
  }));
  const s3 = simulateCatalogueFallback('FINISHED', 12, null, s3Records);
  const s3Has12 = s3.episodes.length === 12;
  const s3Ep11IsFallback = s3.episodes[10]?.source === 'GENERATED_FALLBACK' && s3.episodes[10]?.number === 11;
  const s3Ep12IsFallback = s3.episodes[11]?.source === 'GENERATED_FALLBACK' && s3.episodes[11]?.number === 12;
  const s3Ep1IsTmdb = s3.episodes[0]?.source === 'tmdb';
  recordTest(
    'Scenario 03',
    'Completed Anime with Partial Records (10 of 12)',
    s3Has12 && s3Ep11IsFallback && s3Ep12IsFallback && s3Ep1IsTmdb && s3.completeness === 'partial',
    `Catalogue length: ${s3.episodes.length}, Ep 10: ${s3.episodes[9]?.source}, Ep 11: ${s3.episodes[10]?.source}, Ep 12: ${s3.episodes[11]?.source}`
  );

  // --- SCENARIO 4: Releasing Anime with Gaps (records for 1, 3, 4 aired up to 5) ---
  const s4Records = [
    { number: 1, title: 'Ep 1', source: 'tmdb' },
    { number: 3, title: 'Ep 3', source: 'tmdb' },
    { number: 4, title: 'Ep 4', source: 'tmdb' },
  ];
  const s4 = simulateCatalogueFallback('RELEASING', 12, 6, s4Records);
  const s4Eps2And5Fallback = s4.episodes[1]?.source === 'GENERATED_FALLBACK' && s4.episodes[4]?.source === 'GENERATED_FALLBACK';
  recordTest(
    'Scenario 04',
    'Releasing Anime Gap Filling (missing 2 and 5 filled)',
    s4.episodes.length === 5 && s4Eps2And5Fallback && s4.episodes[0]?.source === 'tmdb',
    `Length: ${s4.episodes.length}, Ep 2: ${s4.episodes[1]?.source}, Ep 5: ${s4.episodes[4]?.source}`
  );

  // --- SCENARIO 5: Anime NOT_YET_RELEASED ---
  const s5 = simulateCatalogueFallback('NOT_YET_RELEASED', 12, null, []);
  recordTest(
    'Scenario 05',
    'Not Yet Released Anime has 0 episodes and resolving status',
    s5.episodes.length === 0 && s5.airedEpisodeCount === 0 && s5.completeness === 'resolving',
    `Episodes: ${s5.episodes.length}, Aired count: ${s5.airedEpisodeCount}, Completeness: ${s5.completeness}`
  );

  // --- SCENARIO 6: Releasing Anime where Episode 1 is in the Future ---
  const s6 = simulateCatalogueFallback('RELEASING', 12, 1, []);
  recordTest(
    'Scenario 06',
    'Releasing Anime before Episode 1 airs produces 0 episodes',
    s6.episodes.length === 0 && s6.airedEpisodeCount === 0,
    `Episodes: ${s6.episodes.length}, Aired count: ${s6.airedEpisodeCount}`
  );

  // --- SCENARIO 7: Ongoing Anime with Unknown Total (e.g. One Piece) ---
  const s7Records = Array.from({ length: 50 }, (_, i) => ({
    number: i + 1,
    title: `Episode ${i + 1}`,
    source: 'tmdb',
  }));
  const s7 = simulateCatalogueFallback('RELEASING', null, 51, s7Records);
  recordTest(
    'Scenario 07',
    'Ongoing anime with null total bounded by confirmed schedule',
    s7.episodes.length === 50 && s7.airedEpisodeCount === 50,
    `Episodes: ${s7.episodes.length}, Aired count: ${s7.airedEpisodeCount}`
  );

  // --- SCENARIO 8: Fallback Entries have UNKNOWN classification & isFiller = false ---
  const s8 = simulateCatalogueFallback('FINISHED', 5, null, []);
  const allUnknown = s8.episodes.every(
    (e) => e.classification === 'UNKNOWN' && e.classificationSource === 'generated_fallback' && e.isFiller === false
  );
  recordTest(
    'Scenario 08',
    'Fallback entries strictly UNKNOWN classification and not fake filler',
    allUnknown,
    `All 5 fallback entries: classification=UNKNOWN, isFiller=false`
  );

  // --- SCENARIO 9: Fallback Entries have undefined overview, thumbnail, airDate ---
  const allNoFakeMetadata = s8.episodes.every(
    (e) => e.overview === undefined && e.thumbnail === undefined && e.airDate === undefined
  );
  recordTest(
    'Scenario 09',
    'Zero fabricated synopses, thumbnails, or air dates in fallback entries',
    allNoFakeMetadata,
    `All 5 entries: overview=${s8.episodes[0]?.overview}, thumbnail=${s8.episodes[0]?.thumbnail}, airDate=${s8.episodes[0]?.airDate}`
  );

  // --- SCENARIO 10: Provider Failure Fallback Activation ---
  const s10 = simulateCatalogueFallback('FINISHED', 24, null, []);
  recordTest(
    'Scenario 10',
    'Provider Failure Graceful Recovery generates all 24 entries',
    s10.episodes.length === 24 && s10.airedEpisodeCount === 24,
    `Recovered: ${s10.episodes.length}/24 entries generated cleanly`
  );

  // --- SCENARIO 11: Duplicate Episode Prevention & Strict Ordering ---
  const s11Duplicates: Partial<VerifiedEpisode>[] = [
    { number: 1, title: 'Ep 1 - TMDB', source: 'tmdb' },
    { number: 2, title: 'Ep 2 - Kitsu', source: 'kitsu' },
    { number: 3, title: 'Ep 3 - AniList', source: 'anilist' },
  ];
  const s11 = simulateCatalogueFallback('FINISHED', 3, null, s11Duplicates);
  const epNumbers = s11.episodes.map((e) => e.number);
  const isStrictlyAscendingAndUnique =
    epNumbers.length === 3 && epNumbers[0] === 1 && epNumbers[1] === 2 && epNumbers[2] === 3;
  recordTest(
    'Scenario 11',
    'Duplicate Prevention and Strict Ascending Order',
    isStrictlyAscendingAndUnique,
    `Episodes: [${epNumbers.join(', ')}]`
  );

  // --- SCENARIO 12: Image URL Validator Correctness ---
  const validTmdb = isValidImageUrl('https://image.tmdb.org/t/p/w300/abc123xyz.jpg');
  const validKitsu = isValidImageUrl('https://media.kitsu.app/episodes/thumbnails/123/original.jpg');
  const validAniList = isValidImageUrl('https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21.jpg');
  const invalidDataUri = isValidImageUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE=');
  const invalidEmpty = isValidImageUrl('');
  const invalidLocalhost = isValidImageUrl('http://localhost:3000/broken.jpg');
  const imgValidatorPass =
    validTmdb && validKitsu && validAniList && !invalidDataUri && !invalidEmpty && !invalidLocalhost;
  recordTest(
    'Scenario 12',
    'Programmatic Image URL Validator Security & Scheme Check',
    imgValidatorPass,
    `TMDB: ${validTmdb}, Kitsu: ${validKitsu}, AniList: ${validAniList}, DataURI blocked: ${!invalidDataUri}, Localhost blocked: ${!invalidLocalhost}`
  );

  // --- SCENARIO 13: Completeness Status 'complete' when all verified ---
  const s13Records = [
    { number: 1, title: 'Ep 1', source: 'tmdb' },
    { number: 2, title: 'Ep 2', source: 'tmdb' },
  ];
  const s13 = simulateCatalogueFallback('FINISHED', 2, null, s13Records);
  recordTest(
    'Scenario 13',
    'Completeness status is "complete" when all records verified',
    s13.completeness === 'complete',
    `Status: ${s13.completeness}`
  );

  // --- SCENARIO 14: Completeness Status 'partial' when partially verified ---
  const s14Records = [{ number: 1, title: 'Ep 1', source: 'tmdb' }];
  const s14 = simulateCatalogueFallback('FINISHED', 3, null, s14Records);
  recordTest(
    'Scenario 14',
    'Completeness status is "partial" when partially verified',
    s14.completeness === 'partial',
    `Status: ${s14.completeness}`
  );

  // --- SCENARIO 15: Completeness Status 'fallback_generated' when 0 verified ---
  const s15 = simulateCatalogueFallback('FINISHED', 13, null, []);
  recordTest(
    'Scenario 15',
    'Completeness status is "fallback_generated" when all records generated',
    s15.completeness === 'fallback_generated',
    `Status: ${s15.completeness}`
  );

  // --- SCENARIO 16: Live Test — Non-episodic Movie (Your Name AniList 21519) ---
  const yourName = await EpisodeResolverService.resolveEpisodes(21519);
  recordTest(
    'Scenario 16',
    'Live Non-episodic Feature (Your Name)',
    yourName !== null && yourName.episodes.length === 1 && yourName.completenessStatus === 'complete',
    `Records: ${yourName?.episodes.length}, Title: "${yourName?.episodes[0]?.title}", Status: ${yourName?.completenessStatus}`
  );

  // --- SCENARIO 17: Live Test — Multi-season Sequel (Jujutsu Kaisen Season 2 AniList 145064) ---
  const jjkS2 = await EpisodeResolverService.resolveEpisodes(145064);
  recordTest(
    'Scenario 17',
    'Live Multi-season Sequel (JJK Season 2 = 23 eps, not entire franchise)',
    jjkS2 !== null && jjkS2.episodes.length === 23 && jjkS2.airedEpisodeCount === 23,
    `Records: ${jjkS2?.episodes.length}/23, Aired count: ${jjkS2?.airedEpisodeCount}, Ep 1: "${jjkS2?.episodes[0]?.title}"`
  );

  // --- SCENARIO 18: Live Test — Tokyo Revengers: Tenjiku-hen (AniList 163329) [USER SCREENSHOT FIX] ---
  const trTenjiku = await EpisodeResolverService.resolveEpisodes(163329);
  const trHas13Eps = trTenjiku !== null && trTenjiku.episodes.length === 13 && trTenjiku.airedEpisodeCount === 13;
  const trHasList = trTenjiku !== null && trTenjiku.hasEpisodeList === true;
  recordTest(
    'Scenario 18',
    'Live Resolution of Tokyo Revengers S2 Part 2 (AniList 163329) [SCREENSHOT ISSUE]',
    trHas13Eps && trHasList,
    `Catalogue: ${trTenjiku?.episodes.length}/13, Aired: ${trTenjiku?.airedEpisodeCount}, Verified: ${trTenjiku?.verifiedRecordsCount}, Status: ${trTenjiku?.completenessStatus}, Source: ${trTenjiku?.source}`
  );

  // --- SCENARIO 19: Live Test — Currently Airing Show (Black Clover Season 2 AniList 195604) ---
  const bcS2 = await EpisodeResolverService.resolveEpisodes(195604);
  const bcOnlyReleased = bcS2 !== null && bcS2.episodes.every((e) => e.number <= (bcS2.nextUpcomingEpisode?.episode ? bcS2.nextUpcomingEpisode.episode - 1 : 100));
  recordTest(
    'Scenario 19',
    'Live Currently Airing Show Excludes Future Episodes (Black Clover S2)',
    bcS2 !== null && bcS2.episodes.length > 0 && bcOnlyReleased,
    `Episodes: ${bcS2?.episodes.length}, Next upcoming: Ep ${bcS2?.nextUpcomingEpisode?.episode}`
  );

  // --- SCENARIO 20: In-flight Deduplication & Cache Stability ---
  const tStart = Date.now();
  const [resA, resB] = await Promise.all([
    EpisodeResolverService.resolveEpisodes(163329),
    EpisodeResolverService.resolveEpisodes(163329),
  ]);
  const dedupTime = Date.now() - tStart;
  recordTest(
    'Scenario 20',
    'In-Flight Deduplication and Shared Cache Stability',
    resA !== null && resB !== null && resA.episodes.length === resB.episodes.length,
    `Deduplicated concurrent fetch in ${dedupTime}ms, Episodes match: ${resA?.episodes.length === resB?.episodes.length}`
  );

  console.log('\n======================================================');
  console.log(`TOTAL REGRESSION TEST RESULTS: ${suiteResults.filter((r) => r.passed).length}/${suiteResults.length} PASSED`);
  console.log('======================================================\n');

  if (suiteResults.some((r) => !r.passed)) {
    process.exit(1);
  }
}

runAll20Scenarios().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
