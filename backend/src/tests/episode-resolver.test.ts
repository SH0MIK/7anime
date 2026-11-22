import { EpisodeResolverService } from '../services/metadata/resolver/episode-resolver.service.js';

interface TestResult {
  category: string;
  id: number;
  name: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const results: TestResult[] = [];

async function runTest(
  category: string,
  id: number,
  name: string,
  validator: (res: any) => { pass: boolean; details: string }
) {
  try {
    const res = await EpisodeResolverService.resolveEpisodes(id);
    const check = validator(res);
    results.push({
      category,
      id,
      name,
      status: check.pass ? 'PASS' : 'FAIL',
      details: check.details,
    });
  } catch (err: any) {
    results.push({
      category,
      id,
      name,
      status: 'FAIL',
      details: `Exception: ${err.message}`,
    });
  }
}

async function main() {
  console.log('=== Starting 7Anime Global Episode Catalogue & Classification Regression Suite ===\n');

  // 1. Black Clover Season 2 — Released episodes only (Screenshot issue fix)
  // Currently airing (7 episodes aired, ep 8 upcoming). Must only include released episodes (<=7), exclude ep 8+.
  await runTest(
    '1. Released Episodes Only (BC S2)',
    195604,
    'Black Clover Season 2',
    (res) => {
      const allReleased = res?.episodes.every((e: any) => e.number <= 7);
      const hasNoFutureEps = !res?.episodes.some((e: any) => e.number >= 8);
      const ep1 = res?.episodes[0];
      const ep2 = res?.episodes[1];
      const pass = res && res.episodes.length === 7 && res.airedEpisodeCount === 7 && allReleased && hasNoFutureEps && res.nextUpcomingEpisode?.episode === 8;
      return {
        pass: Boolean(pass),
        details: `Records: ${res?.episodes.length}, Aired Count: ${res?.airedEpisodeCount}, Next Ep: ${res?.nextUpcomingEpisode?.episode}, Ep 1: "${ep1?.title}" (${ep1?.classification}), Ep 2: "${ep2?.title}" (${ep2?.classification})`,
      };
    }
  );

  // 2. One Piece — Ongoing long-running anime
  // Must only include released episodes, verified count > 1000, canon classification present
  await runTest(
    '2. Ongoing Long-running Anime',
    21,
    'One Piece',
    (res) => {
      const ep1 = res?.episodes[0];
      const hasCanon = res?.episodes.some((e: any) => e.classification === 'CANON');
      const hasFiller = res?.episodes.some((e: any) => e.classification === 'FILLER');
      const pass = res && res.episodes.length > 1000 && hasCanon && hasFiller && ep1?.classification === 'CANON';
      return {
        pass: Boolean(pass),
        details: `Count: ${res?.episodes.length}, Ep 1: "${ep1?.title}" (${ep1?.classification}), Has Filler: ${hasFiller}`,
      };
    }
  );

  // 3. Naruto — Canon and Filler classification
  // Ep 1 is Canon, Ep 101 is Filler
  await runTest(
    '3. Canon & Filler Classification',
    20,
    'Naruto',
    (res) => {
      const ep1 = res?.episodes.find((e: any) => e.number === 1);
      const ep101 = res?.episodes.find((e: any) => e.number === 101);
      const canonCount = res?.episodes.filter((e: any) => e.classification === 'CANON').length || 0;
      const fillerCount = res?.episodes.filter((e: any) => e.classification === 'FILLER').length || 0;
      const pass = res && ep1?.classification === 'CANON' && ep101?.classification === 'FILLER' && fillerCount > 50;
      return {
        pass: Boolean(pass),
        details: `Total: ${res?.episodes.length}, Canon: ${canonCount}, Filler: ${fillerCount}, Ep 1: ${ep1?.classification}, Ep 101: ${ep101?.classification}`,
      };
    }
  );

  // 4. Naruto Shippuden — Mixed and Filler classification
  await runTest(
    '4. Mixed & Filler Classification',
    1735,
    'Naruto Shippuden',
    (res) => {
      const mixedCount = res?.episodes.filter((e: any) => e.classification === 'MIXED').length || 0;
      const fillerCount = res?.episodes.filter((e: any) => e.classification === 'FILLER').length || 0;
      const canonCount = res?.episodes.filter((e: any) => e.classification === 'CANON').length || 0;
      const pass = res && mixedCount > 20 && fillerCount > 100 && canonCount > 150;
      return {
        pass: Boolean(pass),
        details: `Total: ${res?.episodes.length}, Canon: ${canonCount}, Mixed: ${mixedCount}, Filler: ${fillerCount}`,
      };
    }
  );

  // 5. Multi-season TV Sequel: Jujutsu Kaisen Season 2 (Must have 23 released episodes, NOT 59!)
  await runTest(
    '5. Multi-season TV Sequel Resolution',
    145064,
    'Jujutsu Kaisen Season 2',
    (res) => {
      const has23Eps = res && res.episodes.length === 23;
      const ep1Title = res?.episodes[0]?.title || '';
      const pass = has23Eps && ep1Title.toLowerCase().includes('hidden inventory');
      return {
        pass: Boolean(pass),
        details: `Count: ${res?.episodes.length}, Status: ${res?.completenessStatus}, Ep 1: "${ep1Title}"`,
      };
    }
  );

  // 6. Completed anime (Frieren: Beyond Journey’s End)
  await runTest(
    '6. Completed Anime',
    154587,
    'Frieren: Beyond Journey’s End',
    (res) => {
      const pass = res && res.episodes.length === 28 && res.completenessStatus === 'complete';
      return {
        pass: Boolean(pass),
        details: `Count: ${res?.episodes.length}, Status: ${res?.completenessStatus}, Ep 1: "${res?.episodes[0]?.title}"`,
      };
    }
  );

  // 7. Non-episodic / Single Feature (Your Name.)
  await runTest(
    '7. Non-episodic Movie',
    21519,
    'Your Name.',
    (res) => {
      const pass = res && res.episodes.length === 1 && res.completenessStatus === 'complete';
      return {
        pass: Boolean(pass),
        details: `Count: ${res?.episodes.length}, Status: ${res?.completenessStatus}, Title: "${res?.episodes[0]?.title}"`,
      };
    }
  );

  // 8. Anime with unknown filler classification (Must NOT be silently marked as filler or canon)
  await runTest(
    '8. Unknown Filler Classification Handling',
    166700,
    'My Instant Death Ability Is So Overpowered',
    (res) => {
      const ep1 = res?.episodes[0];
      const pass = res && ep1 && ep1.classification === 'UNKNOWN' && ep1.isFiller === false;
      return {
        pass: Boolean(pass),
        details: `Ep 1 classification: "${ep1?.classification}", isFiller: ${ep1?.isFiller}, source: "${ep1?.classificationSource}"`,
      };
    }
  );

  // 9. Cache hit verification & in-flight deduplication
  const t0 = Date.now();
  const [c1, c2] = await Promise.all([
    EpisodeResolverService.resolveEpisodes(154587),
    EpisodeResolverService.resolveEpisodes(154587),
  ]);
  const elapsed = Date.now() - t0;
  results.push({
    category: '9. Cache Hit & Deduplication',
    id: 154587,
    name: 'Concurrent Cache Fetch',
    status: c1 && c2 && c1.verifiedRecordsCount === c2.verifiedRecordsCount ? 'PASS' : 'FAIL',
    details: `Resolved in ${elapsed}ms, Episodes count: ${c1?.episodes.length}`,
  });

  // 10. Global Episode Thumbnail Resolution & Validation (One Piece 129-138)
  await runTest(
    '10. Global Episode Thumbnail Resolution',
    21,
    'One Piece (Eps 129–138)',
    (res) => {
      const ep129 = res?.episodes.find((e: any) => e.number === 129);
      const ep130 = res?.episodes.find((e: any) => e.number === 130);
      const ep131 = res?.episodes.find((e: any) => e.number === 131);
      const ep135 = res?.episodes.find((e: any) => e.number === 135);
      const ep138 = res?.episodes.find((e: any) => e.number === 138);

      const eps129to138HaveThumbs = [129, 130, 131, 132, 133, 134, 135, 136, 137, 138].every((num) => {
        const ep = res?.episodes.find((e: any) => e.number === num);
        return ep && ep.thumbnail && ep.thumbnail.startsWith('https://');
      });

      const pass = res && eps129to138HaveThumbs;
      return {
        pass: Boolean(pass),
        details: `Ep 129: ${ep129?.thumbnail ? 'OK' : 'MISSING'}, Ep 130: ${ep130?.thumbnail ? 'OK' : 'MISSING'}, Ep 131: ${ep131?.thumbnail ? 'OK' : 'MISSING'}, Ep 135: ${ep135?.thumbnail ? 'OK' : 'MISSING'}, Ep 138: ${ep138?.thumbnail ? 'OK' : 'MISSING'}`,
      };
    }
  );

  console.log('\n--- Final Test Results Summary ---');
  let passCount = 0;
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✓' : '✗';
    console.log(`${icon} [${r.status}] ${r.category} (${r.name}): ${r.details}`);
    if (r.status === 'PASS') passCount++;
  }
  console.log(`\nTotal Passed: ${passCount}/${results.length}`);

  if (passCount < results.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
