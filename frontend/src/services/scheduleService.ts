import type { AiringScheduleItem } from '@7anime/shared';
import { apiClient } from './apiClient';
import { AniListService } from './anilist';
import { cacheManager } from './cache';

export interface ScheduleDay {
  dayName: string; // 'Monday', 'Tuesday', ...
  shortName: string; // 'Mon', 'Tue', ...
  dateStr: string; // 'YYYY-MM-DD'
  displayDate: string; // 'Nov 23'
  isToday: boolean;
  startSec: number; // UTC unix seconds for 00:00:00 IST
  endSec: number; // UTC unix seconds for 23:59:59 IST
  episodes: AiringScheduleItem[];
}

export interface WeeklyScheduleData {
  weekLabel: string; // 'Nov 23 – Nov 29, 2026'
  startSec: number; // Monday 00:00:00 IST in UTC seconds
  endSec: number; // Sunday 23:59:59 IST in UTC seconds
  days: ScheduleDay[];
  totalEpisodes: number;
}

const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Returns the current date in Asia/Kolkata (IST).
 */
export function getIstNow(): Date {
  const utcNow = new Date();
  return new Date(utcNow.getTime() + IST_OFFSET_MS);
}

/**
 * Given a reference date and an integer week offset (0 = current week, -1 = last week, 1 = next week),
 * returns the 7 schedule days (Monday to Sunday) calibrated strictly to Asia/Kolkata (IST).
 */
export function computeWeeklyCalendar(weekOffset = 0, referenceNow = new Date()): WeeklyScheduleData {
  // 1. Current IST time
  const istNow = new Date(referenceNow.getTime() + IST_OFFSET_MS);
  const todayY = istNow.getUTCFullYear();
  const todayM = istNow.getUTCMonth();
  const todayD = istNow.getUTCDate();
  const todayDayOfWeek = istNow.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

  // 2. Compute distance from Monday (Monday = 1, Sunday = 7 in week order)
  const distFromMon = todayDayOfWeek === 0 ? 6 : todayDayOfWeek - 1;

  // 3. Find Monday of the target week in IST
  const targetMonDate = new Date(Date.UTC(todayY, todayM, todayD - distFromMon + weekOffset * 7, 0, 0, 0));

  const days: ScheduleDay[] = [];
  const todayDateStr = `${todayY}-${String(todayM + 1).padStart(2, '0')}-${String(todayD).padStart(2, '0')}`;

  for (let i = 0; i < 7; i++) {
    // ith day after Monday
    const currentIstDay = new Date(targetMonDate.getTime() + i * 86400 * 1000);
    const y = currentIstDay.getUTCFullYear();
    const m = currentIstDay.getUTCMonth();
    const d = currentIstDay.getUTCDate();
    const dayOfWeek = currentIstDay.getUTCDay();

    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const displayDate = `${MONTH_NAMES[m]} ${d}`;

    // UTC timestamp bounds for this IST day
    // Midnight IST is Date.UTC(y, m, d, 0, 0, 0) - IST_OFFSET_MS
    const startSec = Math.floor((Date.UTC(y, m, d, 0, 0, 0) - IST_OFFSET_MS) / 1000);
    const endSec = startSec + 86400 - 1;

    days.push({
      dayName: DAY_NAMES[dayOfWeek],
      shortName: DAY_SHORT_NAMES[dayOfWeek],
      dateStr,
      displayDate,
      isToday: dateStr === todayDateStr,
      startSec,
      endSec,
      episodes: [],
    });
  }

  const firstDay = days[0];
  const lastDay = days[6];
  const startSec = firstDay.startSec;
  const endSec = lastDay.endSec;

  const weekLabel = `${firstDay.displayDate} – ${lastDay.displayDate}, ${new Date(startSec * 1000 + IST_OFFSET_MS).getUTCFullYear()}`;

  return {
    weekLabel,
    startSec,
    endSec,
    days,
    totalEpisodes: 0,
  };
}

/**
 * Assigns schedule items to their correct day based on Asia/Kolkata (IST).
 */
export function assignEpisodesToCalendar(
  calendar: WeeklyScheduleData,
  episodes: AiringScheduleItem[]
): WeeklyScheduleData {
  const days = calendar.days.map((day) => ({
    ...day,
    episodes: [] as AiringScheduleItem[],
  }));

  const dayMap = new Map<string, AiringScheduleItem[]>();
  days.forEach((d) => dayMap.set(d.dateStr, d.episodes));

  episodes.forEach((ep) => {
    // Determine the IST date string for this episode's airing timestamp
    const istTime = new Date(ep.airingAt * 1000 + IST_OFFSET_MS);
    const y = istTime.getUTCFullYear();
    const m = istTime.getUTCMonth();
    const d = istTime.getUTCDate();
    const epDateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    const list = dayMap.get(epDateStr);
    if (list) {
      list.push(ep);
    }
  });

  // Sort episodes within each day chronologically by airingAt
  days.forEach((day) => {
    day.episodes.sort((a, b) => a.airingAt - b.airingAt);
  });

  return {
    ...calendar,
    days,
    totalEpisodes: episodes.length,
  };
}

/**
 * Formats a UTC unix seconds timestamp into a readable 12-hour IST time string.
 * e.g. "06:30 PM IST"
 */
export function formatIstTime(unixSec: number): string {
  try {
    const date = new Date(unixSec * 1000);
    const timeStr = date.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return `${timeStr} IST`;
  } catch {
    // Fallback manual calculation
    const istDate = new Date(unixSec * 1000 + IST_OFFSET_MS);
    const h = istDate.getUTCHours();
    const m = istDate.getUTCMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    const displayM = String(m).padStart(2, '0');
    return `${displayH}:${displayM} ${ampm} IST`;
  }
}

/**
 * Formats remaining seconds until airing into a live countdown label.
 */
export function formatScheduleCountdown(airingAt: number, nowSec: number = Math.floor(Date.now() / 1000)): {
  label: string;
  isAired: boolean;
} {
  const diff = airingAt - nowSec;
  if (diff <= 0) {
    return { label: 'Aired', isAired: true };
  }

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;

  if (days > 0) {
    return { label: `in ${days}d ${hours}h`, isAired: false };
  }
  if (hours > 0) {
    return { label: `in ${hours}h ${minutes}m`, isAired: false };
  }
  if (minutes > 0) {
    return { label: `in ${minutes}m ${seconds}s`, isAired: false };
  }
  return { label: `in ${seconds}s`, isAired: false };
}

export class ScheduleService {
  /**
   * Fetches weekly schedule with automatic backend caching and client-side fallback.
   */
  public static async fetchWeeklySchedule(
    startSec: number,
    endSec: number
  ): Promise<AiringScheduleItem[]> {
    const cacheKey = `schedule:week:${startSec}:${endSec}`;

    return cacheManager.getOrFetch<AiringScheduleItem[]>(
      cacheKey,
      async () => {
        // 1. Try Backend API
        try {
          const res = await apiClient.getWeeklySchedule(startSec, endSec, 1, 50);
          if (res && Array.isArray(res.items) && res.items.length > 0) {
            return res.items;
          }
        } catch (backendErr) {
          console.warn('[ScheduleService] Backend schedule call failed, falling back to AniList direct:', backendErr);
        }

        // 2. Direct AniList fallback
        try {
          const direct = await AniListService.getWeeklySchedule(startSec, endSec, 1, 50);
          return direct.items || [];
        } catch (directErr) {
          console.error('[ScheduleService] Direct AniList schedule query failed:', directErr);
          throw directErr;
        }
      },
      {
        ttlMs: 10 * 60 * 1000, // 10 minutes
        staleTtlMs: 20 * 60 * 1000, // 20 minutes SWR
        tags: ['schedule'],
      }
    );
  }
}
