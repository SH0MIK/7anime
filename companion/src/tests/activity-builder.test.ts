import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivityBuilder } from '../discord/activity-builder.js';
import type { DiscordPresencePlaybackPayload } from '@7anime/shared';

test('ActivityBuilder: builds standard watching activity', () => {
  const payload: DiscordPresencePlaybackPayload = {
    animeTitle: "Frieren: Beyond Journey's End",
    routeId: 'frieren-154587',
    episodeNumber: 28,
    seasonNumber: 1,
    isPlaying: true,
    currentTimeSec: 120,
    durationSec: 1440,
    startTimestamp: 1700000000000,
  };

  const activity = ActivityBuilder.buildActivity(payload);

  assert.equal(activity.type, 3);
  assert.equal(activity.details, "Frieren: Beyond Journey's End");
  assert.equal(activity.state, 'Episode 28');
  assert.equal(activity.assets?.small_image, 'play');
  assert.equal(activity.timestamps?.start, 1700000000000);
  assert.equal(activity.buttons?.[0]?.url, 'https://7anime.to/anime/frieren-154587?ep=28');
});

test('ActivityBuilder: handles multi-season series formatting', () => {
  const payload: DiscordPresencePlaybackPayload = {
    animeTitle: 'Jujutsu Kaisen',
    routeId: 'jjk-season-2-145064',
    episodeNumber: 12,
    seasonNumber: 2,
    isPlaying: true,
    currentTimeSec: 45,
    durationSec: 1440,
    startTimestamp: 1700000000000,
  };

  const activity = ActivityBuilder.buildActivity(payload);
  assert.equal(activity.state, 'Season 2 · Episode 12');
});

test('ActivityBuilder: respects privacy settings (hideTitle & hideEpisode)', () => {
  const payload: DiscordPresencePlaybackPayload = {
    animeTitle: 'Confidential Anime',
    routeId: 'secret-1234',
    episodeNumber: 5,
    isPlaying: true,
    currentTimeSec: 30,
    durationSec: 1440,
    hideTitle: true,
    hideEpisode: true,
  };

  const activity = ActivityBuilder.buildActivity(payload);
  assert.equal(activity.details, 'Anime');
  assert.equal(activity.state, 'Streaming on 7Anime');
});

test('ActivityBuilder: displays paused state without timestamps', () => {
  const payload: DiscordPresencePlaybackPayload = {
    animeTitle: 'One Piece',
    routeId: 'one-piece-21',
    episodeNumber: 130,
    isPlaying: false,
    currentTimeSec: 500,
    durationSec: 1440,
    startTimestamp: 1700000000000,
  };

  const activity = ActivityBuilder.buildActivity(payload);
  assert.equal(activity.details, 'Paused: One Piece');
  assert.equal(activity.assets?.small_image, 'pause');
  assert.equal(activity.timestamps, undefined);
});

test('ActivityBuilder.isSameActivity: detects identical activities', () => {
  const p1: DiscordPresencePlaybackPayload = {
    animeTitle: 'Bleach',
    routeId: 'bleach-269',
    episodeNumber: 1,
    isPlaying: true,
    currentTimeSec: 10,
    durationSec: 1400,
    startTimestamp: 1700000000000,
  };

  const a1 = ActivityBuilder.buildActivity(p1);
  const a2 = ActivityBuilder.buildActivity(p1);

  assert.equal(ActivityBuilder.isSameActivity(a1, a2), true);
  assert.equal(ActivityBuilder.isSameActivity(null, null), true);
  assert.equal(ActivityBuilder.isSameActivity(a1, null), false);
});

test('ActivityBuilder.isSameActivity: detects episode or play state differences', () => {
  const p1: DiscordPresencePlaybackPayload = {
    animeTitle: 'Bleach',
    routeId: 'bleach-269',
    episodeNumber: 1,
    isPlaying: true,
    currentTimeSec: 10,
    durationSec: 1400,
  };

  const p2: DiscordPresencePlaybackPayload = {
    ...p1,
    episodeNumber: 2,
  };

  const p3: DiscordPresencePlaybackPayload = {
    ...p1,
    isPlaying: false,
  };

  const a1 = ActivityBuilder.buildActivity(p1);
  const a2 = ActivityBuilder.buildActivity(p2);
  const a3 = ActivityBuilder.buildActivity(p3);

  assert.equal(ActivityBuilder.isSameActivity(a1, a2), false);
  assert.equal(ActivityBuilder.isSameActivity(a1, a3), false);
});
