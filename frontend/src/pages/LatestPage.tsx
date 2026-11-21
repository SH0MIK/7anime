import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Captions, Mic, Search } from 'lucide-react';
import { useApp } from '@/src/context/AppContext';
import { AniListService } from '@/src/services/anilist';
import { apiClient } from '@/src/services/apiClient';
import { ErrorState, EmptyState } from '@/src/components/Skeletons';
import type { AnimeTitle } from '@/src/types/anime';
import type { RecentAiredEpisodeItem } from '@7anime/shared';

export const LatestPage: React.FC = () => {
  const { t } = useApp();
  const [mode, setMode] = useState<'all' | 'sub' | 'dub'>('all');
  const [query, setQuery] = useState('');
  const [recentAiring, setRecentAiring] = useState<RecentAiredEpisodeItem[]>([]);
  const [animeList, setAnimeList] = useState<AnimeTitle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLatest = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [recentRes, browseRes] = await Promise.allSettled([
        apiClient.getRecentAiring(1, 24),
        AniListService.browseAnime({ status: 'releasing', sort: 'newest' }, 1, 24),
      ]);

      if (recentRes.status === 'fulfilled' && recentRes.value.length > 0) {
        setRecentAiring(recentRes.value);
      }
      if (browseRes.status === 'fulfilled') {
        setAnimeList(browseRes.value.items);
      }
    } catch (err: unknown) {
      console.error('[LatestPage] Failed to fetch latest drops:', err);
      setError(err instanceof Error ? err.message : 'Failed to load latest releases');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLatest();
  }, []);

  // Index landscape artwork by id, routeId, slug, and title from animeList for optimal image resolution
  const landscapeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of animeList) {
      const landscape = a.banner || a.artwork?.banner || a.artwork?.background || a.background;
      if (landscape) {
        if (a.id) map.set(String(a.id), landscape);
        if (a.routeId) map.set(a.routeId, landscape);
        if (a.slug) map.set(a.slug, landscape);
        if (a.title) map.set(a.title.toLowerCase().trim(), landscape);
      }
    }
    return map;
  }, [animeList]);

  const items = useMemo(() => {
    let base: Array<{
      routeId: string;
      title: string;
      episode: number;
      thumbnail: string | null;
      duration: string;
      timeAgo: string;
      hasSub: boolean;
      hasDub: boolean;
    }> = [];

    if (recentAiring.length > 0) {
      base = recentAiring.map((ep) => {
        // Priority 1: Check if ep has an explicit landscape thumbnail (different from portrait poster)
        const isThumbnailLandscape = Boolean(ep.thumbnail && ep.thumbnail !== ep.poster);
        // Priority 2: Check matching landscape banner/background from animeList metadata
        const landscapeFromList =
          (ep.anilistId && landscapeMap.get(String(ep.anilistId))) ||
          landscapeMap.get(ep.routeId) ||
          landscapeMap.get(ep.title.toLowerCase().trim());

        const chosenImage =
          (isThumbnailLandscape ? ep.thumbnail : (landscapeFromList || ep.thumbnail || ep.poster)) || null;

        return {
          routeId: ep.routeId,
          title: ep.title,
          episode: ep.episode,
          thumbnail: chosenImage || null,
          duration: ep.duration || '24m',
          timeAgo: ep.timeAgoText || 'Recently',
          hasSub: ep.hasSub,
          hasDub: ep.hasDub,
        };
      });
    } else {
      base = animeList.map((a) => {
        // Priority 1: Landscape banner / background
        const landscapeImg = a.banner || a.artwork?.banner || a.artwork?.background || a.background;
        // Priority 2: Cover or poster as fallback
        const chosenImage = landscapeImg || a.cover || a.poster || null;

        return {
          routeId: a.routeId,
          title: a.title,
          episode: a.subCount || 1,
          thumbnail: chosenImage || null,
          duration: typeof a.duration === 'string' ? a.duration : '24:00',
          timeAgo: 'Recently',
          hasSub: true,
          hasDub: a.dubCount > 0,
        };
      });
    }

    return base.filter((ep) => {
      if (mode === 'sub' && !ep.hasSub) return false;
      if (mode === 'dub' && !ep.hasDub) return false;
      if (query.trim()) {
        return ep.title.toLowerCase().includes(query.trim().toLowerCase());
      }
      return true;
    });
  }, [recentAiring, animeList, landscapeMap, mode, query]);

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header__left">
          <h1 className="page-title">{t('home.latestEpisodes')}</h1>
          <span className="page-subtitle">
            {isLoading ? 'Loading releases...' : `${items.length} recent drops`}
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <div className="watch-audio-switch">
            {(['all', 'sub', 'dub'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="browse-search-pill" style={{ width: 220, height: 34 }}>
            <Search size={14} style={{ opacity: 0.6 }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter latest..."
            />
          </div>
        </div>
      </div>

      {error && items.length === 0 ? (
        <ErrorState
          title="Failed to load latest episodes"
          message={error}
          onRetry={loadLatest}
        />
      ) : isLoading ? (
        <div className="latest-grid-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="latest-ep-card is-loading">
              <div className="latest-ep-thumb skeleton-block" />
              <div className="latest-ep-meta">
                <div className="skeleton-line" style={{ width: '80%' }} />
                <div className="skeleton-line" style={{ width: '40%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No recent episodes found"
          message={query ? `No episodes match "${query}"` : 'Check back later for new episode releases.'}
        />
      ) : (
        <div className="latest-grid-4">
          {items.map((ep) => (
            <Link
              key={`${ep.routeId}-${ep.episode}`}
              to={`/anime/${ep.routeId}?ep=${ep.episode}`}
              className="latest-ep-card"
            >
              <div className="latest-ep-thumb">
                {ep.thumbnail ? (
                  <img
                    src={ep.thumbnail}
                    alt={ep.title}
                    loading="lazy"
                  />
                ) : (
                  <div className="latest-ep-fallback">
                    <span>EP {ep.episode}</span>
                  </div>
                )}
                <span className="latest-ep-badge-time">{ep.timeAgo}</span>
                <span className="latest-ep-badge-num">EP {ep.episode}</span>
              </div>

              <div className="latest-ep-meta">
                <h3 className="latest-ep-title" title={ep.title}>
                  {ep.title}
                </h3>
                <div className="latest-ep-tags">
                  <span className="latest-ep-epnum">Episode {ep.episode}</span>
                  {ep.hasSub && (
                    <span className="lang-pill sub">
                      <Captions size={11} />
                      <span>SUB</span>
                    </span>
                  )}
                  {ep.hasDub && (
                    <span className="lang-pill dub">
                      <Mic size={11} />
                      <span>DUB</span>
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
