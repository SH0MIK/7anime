import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePlayerEmbed,
  parseEmbedProgressMessage,
  normalizePlayerServer,
  ANIMETVPLUS_STRICT_SANDBOX,
  NXSHA_STANDARD_SANDBOX,
} from './index.ts';

test('AnimeTVPlus Server 1 resolves AniList embed URL with strict sandbox and no auto-next/auto-skip', () => {
  const res = resolvePlayerEmbed({
    server: 'server1',
    anilistId: 151807,
    malId: 52299,
    tmdbId: 127532,
    episodeNumber: 3,
  });

  assert.equal(res.ok, true);
  assert.equal(res.provider, 'animetvplus');
  assert.equal(
    res.embedUrl,
    'https://embed.animetvplus.site/home/embed/anilist/151807/3'
  );
  assert.equal(res.sandboxMode, 'strict');
  assert.equal(res.sandboxAttribute, ANIMETVPLUS_STRICT_SANDBOX);
  assert.equal(res.sandboxAttribute?.includes('allow-same-origin'), false);
  assert.equal(res.sandboxAttribute?.includes('allow-popups'), false);
  assert.equal(res.sandboxAttribute?.includes('allow-top-navigation'), false);
  assert.equal(res.capabilities.autoNext, false);
  assert.equal(res.capabilities.autoSkip, false);
  assert.equal(res.capabilities.theaterMode, true);
  assert.equal(res.capabilities.ambientMode, true);
  assert.equal(res.capabilities.fullscreen, true);
});

test('AnimeTVPlus never substitutes MAL ID into AniList endpoint when AniList ID is missing', () => {
  const res = resolvePlayerEmbed({
    server: 'server1',
    anilistId: null,
    malId: 52299,
    episodeNumber: 1,
  });

  assert.equal(res.ok, false);
  assert.equal(res.embedUrl, null);
  assert.equal(res.errorCode, 'missing_anilist_id');
});

test('NXsha Hindi resolves dynamic TMDB TV URL with season, episode, ?lang=hi, and standard popup-blocking sandbox', () => {
  const s1e1 = resolvePlayerEmbed({
    server: 'hindi',
    anilistId: 151807,
    tmdbId: 105009,
    mediaType: 'tv',
    seasonNumber: 1,
    episodeNumber: 1,
  });
  assert.equal(s1e1.ok, true);
  assert.equal(s1e1.embedUrl, 'https://nxsha.space/embed/tv/105009/1/1?lang=hi');
  assert.equal(s1e1.sandboxMode, 'standard');
  assert.equal(s1e1.sandboxAttribute, NXSHA_STANDARD_SANDBOX);
  assert.equal(s1e1.sandboxAttribute?.includes('allow-popups'), false);
  assert.equal(s1e1.sandboxAttribute?.includes('allow-popups-to-escape-sandbox'), false);
  assert.equal(s1e1.sandboxAttribute?.includes('allow-top-navigation'), false);
  assert.equal(s1e1.capabilities.autoplay, true);
  assert.equal(s1e1.capabilities.autoNext, false);
  assert.equal(s1e1.capabilities.autoSkip, false);

  // Season 2 Episode 8 (with tmdbEpisodeNumber override for continuous TMDB seasons)
  const s2e8 = resolvePlayerEmbed({
    server: 'hindi',
    anilistId: 145064,
    tmdbId: 95479,
    mediaType: 'tv',
    seasonNumber: 2,
    episodeNumber: 1,
    tmdbEpisodeNumber: 8,
  });
  assert.equal(s2e8.ok, true);
  assert.equal(s2e8.embedUrl, 'https://nxsha.space/embed/tv/95479/2/8?lang=hi');
});

test('NXsha Hindi validates TMDB ID and rejects movies or missing TMDB mappings', () => {
  const missingTmdb = resolvePlayerEmbed({
    server: 'hindi',
    anilistId: 163329,
    malId: 54918,
    tmdbId: null,
    mediaType: 'tv',
    seasonNumber: 1,
    episodeNumber: 1,
  });
  assert.equal(missingTmdb.ok, false);
  assert.equal(missingTmdb.embedUrl, null);
  assert.equal(missingTmdb.errorCode, 'missing_tmdb_id');

  const movieTmdb = resolvePlayerEmbed({
    server: 'hindi',
    anilistId: 21519,
    tmdbId: 372058,
    mediaType: 'movie',
    seasonNumber: 1,
    episodeNumber: 1,
  });
  assert.equal(movieTmdb.ok, false);
  assert.equal(movieTmdb.embedUrl, null);
  assert.equal(movieTmdb.errorCode, 'unsupported_media_type');
});

test('MegaPlay preserves AniList (beta) and MAL (default) variants with sub/dub and legacy non-sandboxed mode', () => {
  const betaSub = resolvePlayerEmbed({
    server: 'beta',
    anilistId: 21,
    malId: 21,
    episodeNumber: 10,
    audioMode: 'sub',
  });
  assert.equal(betaSub.ok, true);
  assert.equal(betaSub.provider, 'megaplay');
  assert.equal(betaSub.embedUrl, 'https://megaplay.buzz/stream/ani/21/10/sub');
  assert.equal(betaSub.sandboxMode, 'none');
  assert.equal(betaSub.sandboxAttribute, undefined);
  assert.equal(betaSub.capabilities.autoNext, true);
  assert.equal(betaSub.capabilities.autoSkip, true);

  const backupDub = resolvePlayerEmbed({
    server: 'default',
    anilistId: 151807,
    malId: 52299,
    episodeNumber: 4,
    audioMode: 'dub',
  });
  assert.equal(backupDub.ok, true);
  assert.equal(backupDub.embedUrl, 'https://megaplay.buzz/stream/mal/52299/4/dub');
  assert.equal(backupDub.sandboxAttribute, undefined);
});

test('normalizePlayerServer and parseEmbedProgressMessage behave cleanly', () => {
  assert.equal(normalizePlayerServer('hindi'), 'hindi');
  assert.equal(normalizePlayerServer('beta'), 'beta');
  assert.equal(normalizePlayerServer('default'), 'default');
  assert.equal(normalizePlayerServer('unknown'), 'server1');

  const parsed = parseEmbedProgressMessage({
    data: JSON.stringify({ currentTime: 125.4, duration: 1420, ended: false }),
  } as MessageEvent);
  assert.deepEqual(parsed, {
    progressSeconds: 125.4,
    durationSeconds: 1420,
    completed: false,
    isPaused: false,
  });
});
