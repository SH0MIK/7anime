import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivityBuilder, isValidHttpsArtworkUrl } from '../discord/activity-builder.js';
import type { DiscordPresencePlaybackPayload } from '@7anime/shared';

test('ActivityBuilder: builds required Watching Bleach · Episode 12 / On 7Anime format and two buttons', () => {
  const payload: DiscordPresencePlaybackPayload = {
    animeTitle: 'Bleach',
    routeId: 'bleach-269',
    episodeNumber: 12,
    seasonNumber: 1,
    isPlaying: true,
    currentTimeSec: 120,
    durationSec: 1440,
    startTimestamp: 1700000000000,
    artworkUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx269.jpg',
  };

  const activity = ActivityBuilder.buildActivity(payload);

  assert.equal(activity.type, 3);
  assert.equal(activity.details, 'Watching Bleach · Episode 12');
  assert.equal(activity.state, 'On 7Anime');
  assert.equal(activity.assets?.large_image, 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx269.jpg');
  assert.equal(activity.assets?.large_text, 'Bleach');
  assert.equal(activity.assets?.small_image, undefined);
  assert.equal(activity.timestamps?.start, 1700000000000);
  assert.deepEqual(activity.buttons, [
    { label: 'Visit 7Anime', url: 'https://7anime-new.vercel.app' },
    { label: 'Join Discord', url: 'https://discord.gg/TpqgaXjDQC' },
  ]);
});

test('ActivityBuilder: includes season when applicable and formats serverLabel in state', () => {
  const payload: DiscordPresencePlaybackPayload = {
    animeTitle: 'Jujutsu Kaisen',
    routeId: 'jjk-season-2-145064',
    episodeNumber: 12,
    seasonNumber: 2,
    isPlaying: true,
    currentTimeSec: 45,
    durationSec: 1440,
    startTimestamp: 1700000000000,
    serverLabel: 'Server 1',
  };

  const activity = ActivityBuilder.buildActivity(payload);
  assert.equal(activity.details, 'Watching Jujutsu Kaisen · Season 2 · Episode 12');
  assert.equal(activity.state, 'On 7Anime · Server 1');
  assert.equal(activity.assets?.large_image, '7anime_large');
});

test('ActivityBuilder: respects privacy settings (hideTitle & hideEpisode) without leaking', () => {
  const onlyTitleHidden = ActivityBuilder.buildActivity({
    animeTitle: 'Secret Show',
    routeId: 'secret-1234',
    episodeNumber: 5,
    isPlaying: true,
    currentTimeSec: 30,
    durationSec: 1440,
    hideTitle: true,
    artworkUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/secret.jpg',
  });
  assert.equal(onlyTitleHidden.details, 'Watching Anime · Episode 5');
  assert.equal(onlyTitleHidden.assets?.large_image, '7anime_large');
  assert.equal(onlyTitleHidden.assets?.large_text, '7Anime');

  const bothHidden = ActivityBuilder.buildActivity({
    animeTitle: 'Confidential Anime',
    routeId: 'secret-1234',
    episodeNumber: 5,
    isPlaying: true,
    currentTimeSec: 30,
    durationSec: 1440,
    hideTitle: true,
    hideEpisode: true,
  });
  assert.equal(bothHidden.details, 'Watching anime on 7Anime');
  assert.equal(bothHidden.state, 'On 7Anime');
});

test('ActivityBuilder: displays paused state clearly without timestamps', () => {
  const payload: DiscordPresencePlaybackPayload = {
    animeTitle: 'One Piece',
    routeId: 'one-piece-21',
    episodeNumber: 1,
    isPlaying: false,
    currentTimeSec: 500,
    durationSec: 1440,
    startTimestamp: 1700000000000,
  };

  const activity = ActivityBuilder.buildActivity(payload);
  assert.equal(activity.details, 'Paused: One Piece · Episode 1');
  assert.equal(activity.state, 'Paused · On 7Anime');
  assert.equal(activity.timestamps, undefined);
});

test('ActivityBuilder.isSameActivity: compares details, state, buttons, artwork, and timestamps', () => {
  const base: DiscordPresencePlaybackPayload = {
    animeTitle: 'Bleach',
    routeId: 'bleach-269',
    episodeNumber: 1,
    isPlaying: true,
    currentTimeSec: 10,
    durationSec: 1400,
    startTimestamp: 1700000000000,
    artworkUrl: 'https://s4.anilist.co/img1.jpg',
    serverLabel: 'Server 1',
  };

  const a1 = ActivityBuilder.buildActivity(base);
  const a2 = ActivityBuilder.buildActivity({ ...base, startTimestamp: 1700000001000 });
  const diffServer = ActivityBuilder.buildActivity({ ...base, serverLabel: 'Beta server' });
  const diffArt = ActivityBuilder.buildActivity({ ...base, artworkUrl: 'https://s4.anilist.co/img2.jpg' });
  const diffTime = ActivityBuilder.buildActivity({ ...base, startTimestamp: 1700000010000 });
  const paused = ActivityBuilder.buildActivity({ ...base, isPlaying: false });

  assert.equal(ActivityBuilder.isSameActivity(a1, a2), true);
  assert.equal(ActivityBuilder.isSameActivity(a1, diffServer), false);
  assert.equal(ActivityBuilder.isSameActivity(a1, diffArt), false);
  assert.equal(ActivityBuilder.isSameActivity(a1, diffTime), false);
  assert.equal(ActivityBuilder.isSameActivity(a1, paused), false);
});

test('isValidHttpsArtworkUrl: allows public HTTPS URLs only and rejects private/http URLs', () => {
  assert.equal(isValidHttpsArtworkUrl('https://s4.anilist.co/poster.jpg'), true);
  assert.equal(isValidHttpsArtworkUrl('http://s4.anilist.co/poster.jpg'), false);
  assert.equal(isValidHttpsArtworkUrl('https://localhost/poster.jpg'), false);
  assert.equal(isValidHttpsArtworkUrl('https://127.0.0.1/poster.jpg'), false);
  assert.equal(isValidHttpsArtworkUrl('/assets/posters/test.webp'), false);
  assert.equal(isValidHttpsArtworkUrl(`https://s4.anilist.co/${'a'.repeat(250)}`), false);
});
