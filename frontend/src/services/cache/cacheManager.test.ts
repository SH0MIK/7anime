import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryLruCache } from './memoryLruCache.js';
import { CacheManager } from './cacheManager.js';
import { imageTracker } from './imageTracker.js';

test('MemoryLruCache: basic set, get, hit/miss, and expiration', async () => {
  const l1 = new MemoryLruCache(10, 1024 * 1024);

  l1.set('key1', {
    value: 'data1',
    cachedAt: Date.now(),
    expiresAt: Date.now() + 50, // 50ms TTL
    version: 1,
  });

  // Fresh hit
  const hit = l1.get('key1');
  assert.equal(hit.entry?.value, 'data1');
  assert.equal(hit.isStale, false);

  // Miss for non-existent
  const miss = l1.get('non_existent');
  assert.equal(miss.entry, null);

  // Wait for expiration
  await new Promise((r) => setTimeout(r, 60));

  const expired = l1.get('key1');
  assert.equal(expired.entry, null);
});

test('MemoryLruCache: LRU eviction drops oldest accessed key when capacity exceeded', () => {
  const l1 = new MemoryLruCache(3, 1024 * 1024);

  l1.set('a', { value: 1, cachedAt: Date.now(), expiresAt: Date.now() + 60000, version: 1 });
  l1.set('b', { value: 2, cachedAt: Date.now(), expiresAt: Date.now() + 60000, version: 1 });
  l1.set('c', { value: 3, cachedAt: Date.now(), expiresAt: Date.now() + 60000, version: 1 });

  // Access 'a' to make it recently used: order is now b, c, a
  l1.get('a');

  // Insert 'd', causing capacity breach (limit is 3). 'b' is now the oldest and should be evicted!
  l1.set('d', { value: 4, cachedAt: Date.now(), expiresAt: Date.now() + 60000, version: 1 });

  assert.equal(l1.has('b'), false, 'Key "b" must have been evicted');
  assert.equal(l1.has('a'), true);
  assert.equal(l1.has('c'), true);
  assert.equal(l1.has('d'), true);
  assert.equal(l1.evictions, 1);
});

test('CacheManager: in-flight request deduplication collapses concurrent identical calls', async () => {
  const cm = new CacheManager();
  let fetchCount = 0;

  const slowFetcher = async () => {
    fetchCount++;
    await new Promise((r) => setTimeout(r, 40));
    return { title: 'Frieren', episodes: 28 };
  };

  // Launch 5 concurrent requests for same key
  const [r1, r2, r3, r4, r5] = await Promise.all([
    cm.getOrFetch('anime:frieren', slowFetcher),
    cm.getOrFetch('anime:frieren', slowFetcher),
    cm.getOrFetch('anime:frieren', slowFetcher),
    cm.getOrFetch('anime:frieren', slowFetcher),
    cm.getOrFetch('anime:frieren', slowFetcher),
  ]);

  // All 5 must receive identical data
  assert.deepEqual(r1, { title: 'Frieren', episodes: 28 });
  assert.deepEqual(r5, { title: 'Frieren', episodes: 28 });

  // Crucial: fetchCount must be strictly 1!
  assert.equal(fetchCount, 1, 'In-flight deduplication must execute network fetch exactly once');
});

test('CacheManager: Stale-While-Revalidate returns stale data instantly and refreshes in background', async () => {
  const cm = new CacheManager();
  let fetchCount = 0;

  const fetcher = async () => {
    fetchCount++;
    return `version_${fetchCount}`;
  };

  // Initial fetch (v1) with short TTL (30ms) and 1000ms stale window
  const v1 = await cm.getOrFetch('item:swr', fetcher, {
    ttlMs: 30,
    staleTtlMs: 1000,
  });
  assert.equal(v1, 'version_1');
  assert.equal(fetchCount, 1);

  // Wait for initial TTL to expire (into stale window)
  await new Promise((r) => setTimeout(r, 45));

  // Second fetch: should return 'version_1' immediately (stale hit) while triggering background fetch
  const v2Stale = await cm.getOrFetch('item:swr', fetcher, {
    ttlMs: 30,
    staleTtlMs: 1000,
  });
  assert.equal(v2Stale, 'version_1', 'Must return stale value immediately without blocking');

  // Allow background revalidation to settle
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(fetchCount, 2, 'Background revalidation must have executed');

  // Third fetch: now gets fresh 'version_2'
  const v3Fresh = await cm.get('item:swr');
  assert.equal(v3Fresh, 'version_2');
});

test('CacheManager: tag-based invalidation purges related entries', async () => {
  const cm = new CacheManager();

  await cm.set('anime:detail:100', { id: 100 }, { tags: ['anime:100'] });
  await cm.set('anime:episodes:100', [{ ep: 1 }], { tags: ['anime:100'] });
  await cm.set('anime:detail:200', { id: 200 }, { tags: ['anime:200'] });

  assert.ok(await cm.get('anime:detail:100'));
  assert.ok(await cm.get('anime:episodes:100'));
  assert.ok(await cm.get('anime:detail:200'));

  // Invalidate anime 100
  const purged = await cm.invalidateByTag('anime:100');
  assert.equal(purged, 2);

  // Entries for 100 must be gone
  assert.equal(await cm.get('anime:detail:100'), null);
  assert.equal(await cm.get('anime:episodes:100'), null);

  // Entry for 200 must remain untouched
  assert.ok(await cm.get('anime:detail:200'));
});

test('CacheManager: prefix-based invalidation purges all matching prefixes', async () => {
  const cm = new CacheManager();

  await cm.set('search:naruto:1', ['res1']);
  await cm.set('search:naruto:2', ['res2']);
  await cm.set('search:bleach:1', ['res3']);
  await cm.set('trending:1', ['trend1']);

  const purged = await cm.invalidateByPrefix('search:');
  assert.equal(purged, 3);

  assert.equal(await cm.get('search:naruto:1'), null);
  assert.equal(await cm.get('search:naruto:2'), null);
  assert.equal(await cm.get('search:bleach:1'), null);
  assert.ok(await cm.get('trending:1'));
});

test('CacheManager: negative caching suppresses repeated failures for cooldown duration', async () => {
  const cm = new CacheManager();
  let calls = 0;

  const failingFetcher = async () => {
    calls++;
    return null; // Resource 404 / not found
  };

  // Initial call returns null and caches negative result with 50ms negative TTL
  const res1 = await cm.getOrFetch('anime:missing:999', failingFetcher, { negativeTtlMs: 50 });
  assert.equal(res1, null);
  assert.equal(calls, 1);

  // Immediate subsequent call: must return null from cache WITHOUT calling fetcher
  const res2 = await cm.getOrFetch('anime:missing:999', failingFetcher, { negativeTtlMs: 50 });
  assert.equal(res2, null);
  assert.equal(calls, 1, 'Fetcher must not be called again within negative cooldown window');

  // Wait for negative TTL to elapse
  await new Promise((r) => setTimeout(r, 60));

  // Now fetcher can be called again
  const res3 = await cm.getOrFetch('anime:missing:999', failingFetcher, { negativeTtlMs: 50 });
  assert.equal(res3, null);
  assert.equal(calls, 2);
});

test('ImageTracker: marks broken URLs and suppresses repeated load attempts', () => {
  imageTracker.clear();

  const brokenUrl = 'https://broken-cdn.com/missing-thumb-123.jpg';
  assert.equal(imageTracker.isBroken(brokenUrl), false);

  // Mark as broken
  imageTracker.markBroken(brokenUrl, 100); // 100ms cooldown
  assert.equal(imageTracker.isBroken(brokenUrl), true);

  // Other URLs are not affected
  assert.equal(imageTracker.isBroken('https://valid-cdn.com/valid.jpg'), false);
});
