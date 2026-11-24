import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Play,
  Search,
} from 'lucide-react';
import { useApp } from '@/src/context/AppContext';
import {
  assignEpisodesToCalendar,
  computeWeeklyCalendar,
  formatIstTime,
  formatScheduleCountdown,
  ScheduleService,
  type ScheduleDay,
  type WeeklyScheduleData,
} from '@/src/services/scheduleService';
import type { AiringScheduleItem } from '@7anime/shared';
import { EmptyState, ErrorState, GridSkeleton } from '@/src/components/Skeletons';

type FormatFilter = 'ALL' | 'TV' | 'MOVIE' | 'ONA_OVA' | 'SPECIAL';
type StatusFilter = 'ALL' | 'UPCOMING' | 'RELEASED';

export const SchedulePage: React.FC = () => {
  const { t } = useApp();

  // Navigation week offset (0 = current week, -1 = last week, +1 = next week)
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [activeDate, setActiveDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [allWeekItems, setAllWeekItems] = useState<AiringScheduleItem[]>([]);

  // Local ticker for live real-time countdown (zero network polling)
  const [nowSec, setNowSec] = useState<number>(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute 7-day calendar skeleton for current weekOffset in Asia/Kolkata (IST)
  const baseCalendar: WeeklyScheduleData = useMemo(() => {
    return computeWeeklyCalendar(weekOffset);
  }, [weekOffset]);

  // Set default active day on week transition
  useEffect(() => {
    const todayDay = baseCalendar.days.find((d: ScheduleDay) => d.isToday);
    if (todayDay) {
      setActiveDate(todayDay.dateStr);
    } else if (baseCalendar.days.length > 0) {
      setActiveDate(baseCalendar.days[0].dateStr);
    }
  }, [baseCalendar]);

  // Fetch schedule data when week boundaries change
  const fetchSchedule = async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await ScheduleService.fetchWeeklySchedule(
        baseCalendar.startSec,
        baseCalendar.endSec
      );
      setAllWeekItems(items || []);
    } catch (err: unknown) {
      console.error('[SchedulePage] Failed to fetch weekly release schedule:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load release schedule from metadata services.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedule();
  }, [baseCalendar.startSec, baseCalendar.endSec]);

  // Group items by calendar day in IST
  const fullCalendar: WeeklyScheduleData = useMemo(() => {
    return assignEpisodesToCalendar(baseCalendar, allWeekItems);
  }, [baseCalendar, allWeekItems]);

  // Get episodes for the active day tab
  const activeDay = useMemo(() => {
    return fullCalendar.days.find((d: ScheduleDay) => d.dateStr === activeDate);
  }, [fullCalendar, activeDate]);

  const activeDayEpisodes: AiringScheduleItem[] = useMemo(() => {
    return activeDay ? activeDay.episodes : [];
  }, [activeDay]);

  // Filter episodes by query, format, and status
  const filteredEpisodes: AiringScheduleItem[] = useMemo(() => {
    return activeDayEpisodes.filter((ep: AiringScheduleItem) => {
      // Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = ep.title.toLowerCase().includes(q);
        const romajiMatch = ep.romajiTitle?.toLowerCase().includes(q);
        const studioMatch = ep.studios?.some((s: string) => s.toLowerCase().includes(q));
        if (!titleMatch && !romajiMatch && !studioMatch) {
          return false;
        }
      }

      // Format filter
      if (formatFilter !== 'ALL') {
        const fmt = (ep.format || '').toUpperCase();
        if (formatFilter === 'TV' && !fmt.includes('TV')) return false;
        if (formatFilter === 'MOVIE' && fmt !== 'MOVIE') return false;
        if (formatFilter === 'ONA_OVA' && !['ONA', 'OVA'].includes(fmt)) return false;
        if (formatFilter === 'SPECIAL' && !['SPECIAL', 'MUSIC', 'TV_SHORT'].includes(fmt)) return false;
      }

      // Status filter (taking live time into account)
      const isAired = ep.status === 'released' || nowSec >= ep.airingAt;
      if (statusFilter === 'RELEASED' && !isAired) return false;
      if (statusFilter === 'UPCOMING' && isAired) return false;

      return true;
    });
  }, [activeDayEpisodes, searchQuery, formatFilter, statusFilter, nowSec]);

  return (
    <div className="page-shell">
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div className="page-header__left">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'rgba(var(--c-accent, 178 156 224), 0.15)',
                color: 'rgb(var(--c-accent, 178 156 224))',
              }}
            >
              <CalendarIcon size={20} />
            </div>
            <div>
              <h1 className="page-title">Weekly Airing Schedule</h1>
              <p className="page-subtitle">
                Official release timetable in{' '}
                <span
                  style={{
                    color: 'rgb(var(--c-accent, 178 156 224))',
                    fontWeight: 600,
                  }}
                >
                  Asia/Kolkata (IST = UTC+5:30)
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Week navigation control */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 999,
            padding: '4px 6px',
          }}
        >
          <button
            type="button"
            className="browse-facet-btn is-plain"
            onClick={() => setWeekOffset((prev) => prev - 1)}
            aria-label="Previous week"
            title="Previous week"
            style={{
              padding: '6px 8px',
              border: 'none',
              borderRadius: 999,
              cursor: 'pointer',
            }}
          >
            <ChevronLeft size={18} />
          </button>

          <button
            type="button"
            onClick={() => setWeekOffset(0)}
            className="browse-facet-btn"
            style={{
              padding: '4px 12px',
              border: 'none',
              borderRadius: 999,
              background: weekOffset === 0 ? 'rgba(var(--c-accent, 178 156 224), 0.2)' : 'transparent',
              color: weekOffset === 0 ? 'rgb(var(--c-accent, 178 156 224))' : 'rgba(255, 255, 255, 0.8)',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Today
          </button>

          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: '0 8px',
              color: 'rgba(255, 255, 255, 0.9)',
              whiteSpace: 'nowrap',
            }}
          >
            {baseCalendar.weekLabel}
          </span>

          <button
            type="button"
            className="browse-facet-btn is-plain"
            onClick={() => setWeekOffset((prev) => prev + 1)}
            aria-label="Next week"
            title="Next week"
            style={{
              padding: '6px 8px',
              border: 'none',
              borderRadius: 999,
              cursor: 'pointer',
            }}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* 7-Day Day Selector Tabs (Monday through Sunday) */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 8,
          marginBottom: 20,
          scrollbarWidth: 'thin',
          WebkitOverflowScrolling: 'touch',
        }}
        role="tablist"
        aria-label="Days of the week"
      >
        {fullCalendar.days.map((day: ScheduleDay) => {
          const isSelected = activeDate === day.dateStr;
          const count = day.episodes.length;

          return (
            <button
              key={day.dateStr}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveDate(day.dateStr)}
              style={{
                flex: '1 1 0',
                minWidth: 105,
                padding: '12px 10px',
                borderRadius: 14,
                border: isSelected
                  ? '1.5px solid rgb(var(--c-accent, 178 156 224))'
                  : '1px solid rgba(255, 255, 255, 0.08)',
                background: isSelected
                  ? 'rgba(var(--c-accent, 178 156 224), 0.14)'
                  : day.isToday
                  ? 'rgba(255, 255, 255, 0.06)'
                  : 'rgba(255, 255, 255, 0.02)',
                color: isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.8)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                position: 'relative',
                transition: 'all 0.15s ease-in-out',
              }}
            >
              {day.isToday && (
                <span
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    fontSize: 9.5,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: '1px 5px',
                    borderRadius: 999,
                    background: 'rgba(var(--c-accent, 178 156 224), 0.3)',
                    color: 'rgb(var(--c-accent, 178 156 224))',
                  }}
                >
                  Today
                </span>
              )}

              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {day.shortName}
              </span>

              <span
                style={{
                  fontSize: 12,
                  color: isSelected ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.5)',
                }}
              >
                {day.displayDate}
              </span>

              <span
                style={{
                  marginTop: 2,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '1px 7px',
                  borderRadius: 999,
                  background: isSelected
                    ? 'rgba(var(--c-accent, 178 156 224), 0.25)'
                    : 'rgba(255, 255, 255, 0.06)',
                  color: isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
                }}
              >
                {count} {count === 1 ? 'ep' : 'eps'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter Toolbar: Search + Format Filter Pills + Status Filter */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 24,
          padding: '12px 16px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: 14,
        }}
      >
        {/* Search */}
        <div className="browse-search-pill" style={{ maxWidth: 280, height: 34 }}>
          <Search size={14} style={{ opacity: 0.6 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search day schedule..."
            aria-label="Filter anime title"
          />
        </div>

        {/* Format Pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          {(
            [
              { id: 'ALL', label: 'All Formats' },
              { id: 'TV', label: 'TV' },
              { id: 'MOVIE', label: 'Movie' },
              { id: 'ONA_OVA', label: 'ONA / OVA' },
              { id: 'SPECIAL', label: 'Special' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFormatFilter(item.id)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '5px 11px',
                borderRadius: 999,
                border: '1px solid',
                borderColor:
                  formatFilter === item.id
                    ? 'rgb(var(--c-accent, 178 156 224))'
                    : 'rgba(255, 255, 255, 0.1)',
                background:
                  formatFilter === item.id
                    ? 'rgba(var(--c-accent, 178 156 224), 0.18)'
                    : 'rgba(255, 255, 255, 0.03)',
                color:
                  formatFilter === item.id ? '#ffffff' : 'rgba(255, 255, 255, 0.75)',
                cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Status Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {(
            [
              { id: 'ALL', label: 'All Status' },
              { id: 'UPCOMING', label: 'Upcoming' },
              { id: 'RELEASED', label: 'Released' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStatusFilter(item.id)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '5px 10px',
                borderRadius: 999,
                border: '1px solid',
                borderColor:
                  statusFilter === item.id
                    ? 'rgba(255, 255, 255, 0.4)'
                    : 'rgba(255, 255, 255, 0.08)',
                background:
                  statusFilter === item.id
                    ? 'rgba(255, 255, 255, 0.15)'
                    : 'transparent',
                color:
                  statusFilter === item.id ? '#ffffff' : 'rgba(255, 255, 255, 0.65)',
                cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <GridSkeleton count={12} />
      ) : error ? (
        <ErrorState
          title="Could not load weekly schedule"
          message={error}
          onRetry={fetchSchedule}
        />
      ) : filteredEpisodes.length === 0 ? (
        <EmptyState
          title="No scheduled anime episodes"
          message={
            searchQuery || formatFilter !== 'ALL' || statusFilter !== 'ALL'
              ? 'No scheduled episodes match the selected filter criteria for this day.'
              : `There are no scheduled releases catalogued for this day in Asia/Kolkata (IST).`
          }
          onReset={() => {
            setSearchQuery('');
            setFormatFilter('ALL');
            setStatusFilter('ALL');
          }}
          resetLabel="Clear Filters"
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 16,
          }}
        >
          {filteredEpisodes.map((ep: AiringScheduleItem) => {
            const isReleased = ep.status === 'released' || nowSec >= ep.airingAt;
            const istTime = formatIstTime(ep.airingAt);
            const countdown = formatScheduleCountdown(ep.airingAt, nowSec);

            return (
              <div
                key={ep.id}
                style={{
                  display: 'flex',
                  gap: 14,
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 14,
                  padding: 12,
                  overflow: 'hidden',
                  position: 'relative',
                  transition: 'transform 0.15s ease, border-color 0.15s ease',
                }}
              >
                {/* Poster / Thumbnail */}
                <Link
                  to={`/anime/${ep.routeId}`}
                  style={{
                    flexShrink: 0,
                    width: 84,
                    height: 118,
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: 'rgba(255, 255, 255, 0.06)',
                    display: 'block',
                    position: 'relative',
                  }}
                >
                  <img
                    src={ep.poster}
                    alt={ep.title}
                    loading="lazy"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transition: 'transform 0.25s ease',
                    }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        'https://placehold.co/160x220/14141e/ffffff?text=7Anime';
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 4,
                      left: 4,
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 5px',
                      borderRadius: 4,
                      background: 'rgba(0, 0, 0, 0.75)',
                      backdropFilter: 'blur(4px)',
                      color: '#ffffff',
                    }}
                  >
                    EP {ep.episode}
                  </span>
                </Link>

                {/* Info Container */}
                <div
                  style={{
                    flex: '1 1 auto',
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    {/* Top Status & Airing Time Row */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6,
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: 'rgba(255, 255, 255, 0.85)',
                        }}
                      >
                        <Clock size={12} style={{ opacity: 0.6 }} />
                        {istTime}
                      </span>

                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          padding: '2px 7px',
                          borderRadius: 999,
                          background: isReleased
                            ? 'rgba(16, 185, 129, 0.15)'
                            : ep.status === 'delayed'
                            ? 'rgba(245, 158, 11, 0.15)'
                            : 'rgba(99, 102, 241, 0.15)',
                          color: isReleased
                            ? '#34d399'
                            : ep.status === 'delayed'
                            ? '#fbbf24'
                            : '#818cf8',
                          border: `1px solid ${
                            isReleased
                              ? 'rgba(16, 185, 129, 0.3)'
                              : ep.status === 'delayed'
                              ? 'rgba(245, 158, 11, 0.3)'
                              : 'rgba(99, 102, 241, 0.3)'
                          }`,
                        }}
                      >
                        {isReleased ? 'Released' : ep.status === 'delayed' ? 'Delayed' : 'Upcoming'}
                      </span>
                    </div>

                    {/* Anime Title */}
                    <Link
                      to={`/anime/${ep.routeId}`}
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        fontSize: 14,
                        fontWeight: 650,
                        lineHeight: 1.3,
                        color: '#ffffff',
                        textDecoration: 'none',
                      }}
                      title={ep.title}
                    >
                      {ep.title}
                    </Link>

                    {/* Meta info tags (Format, Studio) */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 4,
                        fontSize: 11.5,
                        color: 'rgba(255, 255, 255, 0.55)',
                      }}
                    >
                      {ep.format && (
                        <span>
                          {ep.format.replace('_', ' ')}
                        </span>
                      )}
                      {ep.studios && ep.studios.length > 0 && (
                        <>
                          <span>•</span>
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 120,
                            }}
                          >
                            {ep.studios[0]}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Bottom Row: Countdown and Watch Action */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      marginTop: 10,
                      paddingTop: 8,
                      borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: isReleased ? '#34d399' : 'rgb(var(--c-accent, 178 156 224))',
                      }}
                    >
                      {countdown.label}
                    </span>

                    {isReleased ? (
                      <Link
                        to={`/anime/${ep.routeId}?ep=${ep.episode}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '4px 10px',
                          borderRadius: 8,
                          background: 'rgba(var(--c-accent, 178 156 224), 0.2)',
                          border: '1px solid rgba(var(--c-accent, 178 156 224), 0.4)',
                          color: '#ffffff',
                          fontSize: 11.5,
                          fontWeight: 600,
                          textDecoration: 'none',
                        }}
                      >
                        <Play size={12} fill="currentColor" />
                        <span>Watch Ep</span>
                      </Link>
                    ) : (
                      <Link
                        to={`/anime/${ep.routeId}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11.5,
                          color: 'rgba(255, 255, 255, 0.65)',
                          textDecoration: 'none',
                        }}
                      >
                        <span>Details</span>
                        <ExternalLink size={12} />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
