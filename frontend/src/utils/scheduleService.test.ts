import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWeeklyCalendar,
  assignEpisodesToCalendar,
  formatIstTime,
  formatScheduleCountdown,
} from '../services/scheduleService';
import type { AiringScheduleItem } from '@7anime/shared';

test('computeWeeklyCalendar returns exactly 7 days starting from Monday', () => {
  const ref = new Date('2026-11-23T12:00:00Z'); // Monday in IST as well
  const cal = computeWeeklyCalendar(0, ref);

  assert.equal(cal.days.length, 7);
  assert.equal(cal.days[0].dayName, 'Monday');
  assert.equal(cal.days[0].shortName, 'Mon');
  assert.equal(cal.days[6].dayName, 'Sunday');
  assert.equal(cal.days[6].shortName, 'Sun');
  assert.equal(cal.days[0].dateStr, '2026-11-23');
  assert.equal(cal.days[6].dateStr, '2026-11-29');
});

test('computeWeeklyCalendar handles week offsets accurately', () => {
  const ref = new Date('2026-11-23T12:00:00Z');
  const prevWeek = computeWeeklyCalendar(-1, ref);
  const nextWeek = computeWeeklyCalendar(1, ref);

  assert.equal(prevWeek.days[0].dateStr, '2026-11-16');
  assert.equal(prevWeek.days[6].dateStr, '2026-11-22');

  assert.equal(nextWeek.days[0].dateStr, '2026-11-30');
  assert.equal(nextWeek.days[6].dateStr, '2026-12-06');
});

test('computeWeeklyCalendar handles month boundary crossing smoothly', () => {
  // Reference: Dec 01, 2026 (Tuesday)
  const ref = new Date('2026-12-01T12:00:00Z');
  const cal = computeWeeklyCalendar(0, ref);

  assert.equal(cal.days[0].dayName, 'Monday');
  assert.equal(cal.days[0].dateStr, '2026-11-30');
  assert.equal(cal.days[1].dayName, 'Tuesday');
  assert.equal(cal.days[1].dateStr, '2026-12-01');
  assert.equal(cal.days[6].dateStr, '2026-12-06');
});

test('formatIstTime converts UTC timestamps to Asia/Kolkata 12-hour format', () => {
  // 12:00:00 UTC = 17:30:00 IST (05:30 PM)
  const utcSec = Math.floor(new Date('2026-11-23T12:00:00Z').getTime() / 1000);
  const formatted = formatIstTime(utcSec);

  assert.ok(formatted.includes('05:30 PM IST') || formatted.includes('5:30 PM IST'), `Expected 5:30 PM IST, got ${formatted}`);
});

test('assignEpisodesToCalendar assigns episodes to correct IST day even across midnight UTC', () => {
  // An episode airing at 20:00 UTC on Nov 23
  // In IST (+5:30), that is 01:30 AM on Nov 24 (Tuesday)!
  const airingAtUtc = Math.floor(new Date('2026-11-23T20:00:00Z').getTime() / 1000);

  const mockEpisode: AiringScheduleItem = {
    id: 101,
    anilistId: 21,
    routeId: 'one-piece-21',
    title: 'One Piece',
    episode: 1181,
    airingAt: airingAtUtc,
    timeUntilAiring: 3600,
    status: 'upcoming',
    poster: 'https://example.com/poster.jpg',
    genres: ['Action', 'Adventure'],
    studios: ['Toei Animation'],
  };

  const ref = new Date('2026-11-23T12:00:00Z');
  const cal = computeWeeklyCalendar(0, ref);
  const assigned = assignEpisodesToCalendar(cal, [mockEpisode]);

  // Nov 23 (Monday) should have 0 episodes
  assert.equal(assigned.days[0].episodes.length, 0);
  // Nov 24 (Tuesday) should have the episode!
  assert.equal(assigned.days[1].episodes.length, 1);
  assert.equal(assigned.days[1].episodes[0].id, 101);
});

test('formatScheduleCountdown reports Aired vs live countdown accurately', () => {
  const now = 1700000000;

  const past = formatScheduleCountdown(now - 100, now);
  assert.equal(past.isAired, true);
  assert.equal(past.label, 'Aired');

  const in30s = formatScheduleCountdown(now + 30, now);
  assert.equal(in30s.isAired, false);
  assert.equal(in30s.label, 'in 30s');

  const in5m = formatScheduleCountdown(now + 300, now);
  assert.equal(in5m.isAired, false);
  assert.ok(in5m.label.startsWith('in 5m'));

  const in2h = formatScheduleCountdown(now + 7200, now);
  assert.equal(in2h.isAired, false);
  assert.ok(in2h.label.startsWith('in 2h'));

  const in3d = formatScheduleCountdown(now + 3 * 86400 + 3600, now);
  assert.equal(in3d.isAired, false);
  assert.ok(in3d.label.startsWith('in 3d'));
});
