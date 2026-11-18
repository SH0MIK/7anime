import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Captions, Mic, Search } from 'lucide-react';
import { useApp } from '@/src/context/AppContext';
import { AniListService } from '@/src/services/anilist';
import { ErrorState, EmptyState } from '@/src/components/Skeletons';
import type { AnimeTitle } from '@/src/types/anime';

export const LatestPage: React.FC = () => {
  const { t, contentPrefs } = useApp();
  const [mode, setMode] = useState<'all' | 'sub' | 'dub'>('all');
  const [query, setQuery] = useState('');
  const [animeList, setAnimeList] = useState<AnimeTitle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLatest = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await AniListService.browseAnime({ status: 'releasing', sort: 'newest' }, 1, 28);
      setAnimeList(res.items);
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

  const items = useMemo(() => {
    const base = animeList.map((a, idx) => ({
      routeId: a.routeId,
      title: a.title,
      episode: a.subCount || 1,
      thumbnail: a.banner || a.poster,
      duration: typeof a.duration === 'string' ? a.duration : '24:00',
      timeAgo: `${idx * 15 + 10}m ago`,
      hasSub: true,
      hasDub: a.dubCount > 0,
    }));

    return base.filter((ep) => {
      if (mode === 'sub' && !ep.hasSub) return false;
      if (mode === 'dub' && !ep.hasDub) return false;
      if (query.trim()) {
        return ep.title.toLowerCase().includes(query.trim().toLowerCase());
      }
      return true;
    });
  }, [animeList, mode, query]);

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

      {error && animeList.length === 0 ? (
        <ErrorState
          title="Failed to load latest episodes"
          message={error}
          onRetry={loadLatest}
        />
      ) : isLoading ? (
        <div className="latest-grid-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 180,
                borderRadius: 12,
                background: 'rgba(255, 255, 255, 0.05)',
                animation: 'pulse 1.8s infinite',
              }}
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No episodes found"
          message="No recent drops match your active filter."
          onReset={() => {
            setMode('all');
            setQuery('');
          }}
          resetLabel="Reset filters"
        />
      ) : (
        <div className="latest-grid-4">
          {items.map((ep) => (
            <Link
              key={`${ep.routeId}-${ep.episode}`}
              to={`/anime/${ep.routeId}?ep=${ep.episode}`}
              className="cw"
            >
              <div className="cw-thumb">
                {contentPrefs.showEpisodeThumbsOnHome && ep.thumbnail ? (
                  <img src={ep.thumbnail} alt={ep.title} loading="lazy" />
                ) : (
                  <div className="cw-placeholder">
                    <span className="cw-placeholder-number">
                      {String(ep.episode).padStart(2, '0')}
                    </span>
                  </div>
                )}
                <div className="cw-shade" />
                <div className="cw-badges-tl">
                  {ep.hasSub && (
                    <span className="cw-badge">
                      <Captions size={11} />
                      <span>SUB</span>
                    </span>
                  )}
                  {ep.hasDub && (
                    <span className="cw-badge">
                      <Mic size={11} />
                      <span>DUB</span>
                    </span>
                  )}
                </div>
                <span className="cw-duration">{ep.duration ?? '24:00'}</span>
                <div className="cw-inside">
                  <div className="cw-title">{ep.title}</div>
                  <div className="cw-detail">
                    Episode {ep.episode} · {ep.timeAgo}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
