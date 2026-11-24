import test from 'node:test';
import assert from 'node:assert/strict';
import { httpCacheMiddleware } from '../middleware/httpCache.middleware.js';
import { MemoryCacheService } from '../services/cache/memory-cache.service.js';
import { RedisCacheService } from '../services/cache/redis-cache.service.js';

test('httpCacheMiddleware: sets Cache-Control and computes ETag on public GET responses', (t, done) => {
  const middleware = httpCacheMiddleware({
    maxAgeSec: 600,
    sMaxAgeSec: 1200,
    staleWhileRevalidateSec: 3600,
  });

  const req: any = {
    method: 'GET',
    path: '/api/anime/21',
    headers: {},
  };

  const headers: Record<string, string> = {};
  let sentBody: any = null;

  const res: any = {
    setHeader: (name: string, val: string) => {
      headers[name.toLowerCase()] = val;
    },
    json: function (body: any) {
      sentBody = body;
      return this;
    },
    send: function (body: any) {
      sentBody = body;
      return this;
    },
  };

  middleware(req, res, () => {
    res.json({ id: 21, title: 'One Piece' });

    assert.equal(
      headers['cache-control'],
      'public, max-age=600, s-maxage=1200, stale-while-revalidate=3600'
    );
    assert.ok(headers['etag'], 'ETag header must be present');
    assert.ok(headers['etag'].startsWith('W/"'));
    assert.deepEqual(sentBody, { id: 21, title: 'One Piece' });
    done();
  });
});

test('httpCacheMiddleware: returns 304 Not Modified when If-None-Match matches ETag', (t, done) => {
  const middleware = httpCacheMiddleware();
  const testPayload = { id: 21, title: 'One Piece' };

  // 1. First request to obtain ETag
  let etag = '';
  const req1: any = { method: 'GET', path: '/api/anime/21', headers: {} };
  const res1: any = {
    setHeader: (name: string, val: string) => {
      if (name.toLowerCase() === 'etag') etag = val;
    },
    json: () => res1,
    send: () => res1,
  };

  middleware(req1, res1, () => {
    res1.json(testPayload);
    assert.ok(etag.length > 0);

    // 2. Second request sending If-None-Match matching the ETag
    let statusSet = 200;
    let ended = false;

    const req2: any = {
      method: 'GET',
      path: '/api/anime/21',
      headers: { 'if-none-match': etag },
    };

    const res2: any = {
      setHeader: () => {},
      status: (code: number) => {
        statusSet = code;
        return {
          end: () => {
            ended = true;
          },
        };
      },
      json: () => res2,
    };

    middleware(req2, res2, () => {
      res2.json(testPayload);
      assert.equal(statusSet, 304, 'Must return HTTP 304 Not Modified');
      assert.equal(ended, true, 'Response must end without re-sending body payload');
      done();
    });
  });
});

test('httpCacheMiddleware: isolates authenticated requests with private no-cache headers', (t, done) => {
  const middleware = httpCacheMiddleware();
  const req: any = {
    method: 'GET',
    path: '/api/auth/me',
    headers: { authorization: 'Bearer test_token_123' },
  };

  const headers: Record<string, string> = {};
  const res: any = {
    setHeader: (name: string, val: string) => {
      headers[name.toLowerCase()] = val;
    },
    json: () => res,
  };

  middleware(req, res, () => {
    assert.equal(
      headers['cache-control'],
      'private, no-cache, no-store, must-revalidate'
    );
    assert.equal(headers['pragma'], 'no-cache');
    done();
  });
});

test('MemoryCacheService: basic operations, TTL, and deleteByPrefix', () => {
  const cache = new MemoryCacheService(1000);

  cache.set('anime:search:naruto', { result: 1 });
  cache.set('anime:search:bleach', { result: 2 });
  cache.set('anime:detail:21', { result: 3 });

  assert.equal(cache.has('anime:search:naruto'), true);
  assert.equal(cache.has('anime:detail:21'), true);

  const deletedCount = cache.deleteByPrefix('anime:search:');
  assert.equal(deletedCount, 2);

  assert.equal(cache.has('anime:search:naruto'), false);
  assert.equal(cache.has('anime:search:bleach'), false);
  assert.equal(cache.has('anime:detail:21'), true);
});

test('RedisCacheService: getOrSet with in-flight deduplication and prefix deletion', async () => {
  const cache = new RedisCacheService();
  let fetchCalls = 0;

  const slowFetcher = async () => {
    fetchCalls++;
    await new Promise((r) => setTimeout(r, 30));
    return { name: 'Jujutsu Kaisen', season: 2 };
  };

  // Launch 3 simultaneous requests for same key
  const [res1, res2, res3] = await Promise.all([
    cache.getOrSet('test:coalesce', slowFetcher, 60),
    cache.getOrSet('test:coalesce', slowFetcher, 60),
    cache.getOrSet('test:coalesce', slowFetcher, 60),
  ]);

  assert.deepEqual(res1, { name: 'Jujutsu Kaisen', season: 2 });
  assert.deepEqual(res3, { name: 'Jujutsu Kaisen', season: 2 });
  assert.equal(fetchCalls, 1, 'In-flight requests must share single fetch promise');

  // Test prefix deletion
  await cache.delByPrefix('test:');
  const cachedAfterDel = await cache.get('test:coalesce');
  assert.equal(cachedAfterDel, null);
});
