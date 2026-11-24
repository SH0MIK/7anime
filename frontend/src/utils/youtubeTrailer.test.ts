import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractYouTubeVideoId,
  isTrailerKeyFailed,
  markTrailerKeyFailed,
  clearFailedTrailersCache,
  YOUTUBE_ERROR_DESCRIPTIONS,
} from './youtubeTrailer';

test('extractYouTubeVideoId: correctly validates and extracts 11-character YouTube IDs', () => {
  // Direct raw 11-char IDs
  assert.equal(extractYouTubeVideoId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeVideoId('a_B-1234567'), 'a_B-1234567');
  assert.equal(extractYouTubeVideoId('  dQw4w9WgXcQ  '), 'dQw4w9WgXcQ');

  // Full youtube.com watch URLs
  assert.equal(
    extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    'dQw4w9WgXcQ'
  );
  assert.equal(
    extractYouTubeVideoId('https://youtube.com/watch?feature=shared&v=dQw4w9WgXcQ'),
    'dQw4w9WgXcQ'
  );

  // Short youtu.be URLs
  assert.equal(
    extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ'),
    'dQw4w9WgXcQ'
  );

  // Embed and nocookie URLs
  assert.equal(
    extractYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1'),
    'dQw4w9WgXcQ'
  );
  assert.equal(
    extractYouTubeVideoId('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'),
    'dQw4w9WgXcQ'
  );
});

test('extractYouTubeVideoId: rejects invalid, malformed, or missing trailer inputs', () => {
  assert.equal(extractYouTubeVideoId(null), null);
  assert.equal(extractYouTubeVideoId(undefined), null);
  assert.equal(extractYouTubeVideoId(''), null);
  assert.equal(extractYouTubeVideoId('   '), null);
  assert.equal(extractYouTubeVideoId('abc'), null);
  assert.equal(extractYouTubeVideoId('invalid_id_with_special$chars!'), null);
  assert.equal(extractYouTubeVideoId('this_string_is_way_too_long_for_youtube'), null);
  assert.equal(extractYouTubeVideoId('https://vimeo.com/123456789'), null);
});

test('YouTube error descriptions: maps standard Player API error codes', () => {
  assert.ok(YOUTUBE_ERROR_DESCRIPTIONS[2].includes('invalid parameter'));
  assert.ok(YOUTUBE_ERROR_DESCRIPTIONS[5].includes('HTML5'));
  assert.ok(YOUTUBE_ERROR_DESCRIPTIONS[100].includes('removed or marked private'));
  assert.ok(YOUTUBE_ERROR_DESCRIPTIONS[101].includes('embedded'));
  assert.ok(YOUTUBE_ERROR_DESCRIPTIONS[150].includes('embedded'));
  assert.ok(YOUTUBE_ERROR_DESCRIPTIONS[153].includes('policy or restriction'));
});

test('negative caching: tracks failed trailer keys without duplicate attempts', () => {
  clearFailedTrailersCache();

  const failedId = 'dQw4w9WgXcQ';
  assert.equal(isTrailerKeyFailed(failedId), false);

  markTrailerKeyFailed(failedId);
  assert.equal(isTrailerKeyFailed(failedId), true);
  assert.equal(isTrailerKeyFailed('otherVideoId'), false);

  clearFailedTrailersCache();
  assert.equal(isTrailerKeyFailed(failedId), false);
});
