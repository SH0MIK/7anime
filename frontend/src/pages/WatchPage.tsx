import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Captions,
  ChevronLeft,
  ChevronRight,
  Flag,
  Info,
  Lightbulb,
  Maximize2,
  Mic,
  Monitor,
  Server,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react';
import { useApp } from '@/src/context/AppContext';
import {
  MANGA_CATALOG,
  STILLS_POOL,
} from '@/src/data/catalogService';
import {
  getRelatedMangaForWatch,
  type WatchOrderItem,
} from '@/src/utils/watchRelations';
import { GlassPlayer } from '@/src/components/GlassPlayer';
import { WatchPlaylistPanel } from '@/src/components/WatchPlaylistPanel';
import { WatchAnimeMeta } from '@/src/components/WatchAnimeMeta';
import { WatchCommentsSection } from '@/src/components/WatchCommentsSection';
import { WatchSidebarExtras } from '@/src/components/WatchSidebarExtras';
import { AniListService } from '@/src/services/anilist';
import { apiClient } from '@/src/services/apiClient';
import { ArtworkResolver } from '@/src/services/artworkResolver';
import { ErrorState } from '@/src/components/Skeletons';
import type { AnimeTitle, EpisodeItem } from '@/src/types/anime';
import type { AnimeEpisodeCatalogue } from '@7anime/shared';

function extractAniListId(rawParam?: string): number | null {
  if (!rawParam) return null;
  const trimmed = rawParam.trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  const match = trimmed.match(/-(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

export const WatchPage: React.FC = () => {
  const { id, episode: epParam } = useParams<{ id: string; episode?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const {
    t,
    playerPrefs,
    setPlayerPrefs,
    setReportOpen,
    showToast,
  } = useApp();

  const [anime, setAnime] = useState<AnimeTitle | null>(null);
  const [episodesData, setEpisodesData] = useState<AnimeEpisodeCatalogue | null>(null);
  const [liveRelations, setLiveRelations] = useState<AnimeTitle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadWatchAnime() {
      setIsLoading(true);
      setError(null);

      let targetId = extractAniListId(id);
      if (!targetId && id) {
        try {
          const matches = await AniListService.searchPreview(id.replace(/-/g, ' '), 1);
          if (matches.length > 0) targetId = matches[0].id;
        } catch (e) {
          console.warn('[WatchPage] AniList search fallback failed:', e);
        }
      }

      if (!targetId) {
        setIsLoading(false);
        setError(`Could not resolve anime "${id}"`);
        return;
      }

      try {
        const [backendResolved, anilistDetails, episodesResult] = await Promise.allSettled([
          apiClient.getAnimeById(targetId),
          AniListService.getAnimeDetails(targetId),
          apiClient.getEpisodes(targetId),
        ]);

        const backendData = backendResolved.status === 'fulfilled' ? backendResolved.value : null;
        const anilistData = anilistDetails.status === 'fulfilled' ? anilistDetails.value : null;
        const catData = episodesResult.status === 'fulfilled' ? episodesResult.value : null;

        if (catData && !isCancelled) {
          setEpisodesData(catData);
        }

        if (!backendData && !anilistData) {
          throw new Error(`Failed to load anime with ID ${targetId}`);
        }

        if (anilistData) {
          setLiveRelations(anilistData.related);
        }

        const verifiedEpCount = catData?.totalAnnouncedEpisodes ?? catData?.airedEpisodeCount ?? backendData?.episodes ?? anilistData?.anime?.episodeCount ?? 0;
        const verifiedSubCount = catData?.airedEpisodeCount ?? verifiedEpCount;

        let base: AnimeTitle;
        if (anilistData) {
          base = {
            ...anilistData.anime,
            episodeCount: verifiedEpCount || anilistData.anime.episodeCount,
            subCount: verifiedSubCount || anilistData.anime.subCount,
          };
        } else {
          base = {
            id: targetId,
            slug: backendData!.routeId || String(targetId),
            routeId: backendData!.routeId || String(targetId),
            title: backendData!.titles.english || backendData!.titles.romaji || 'Untitled',
            poster: backendData!.artwork.poster || '',
            banner: backendData!.artwork.backdrop || null,
            year: backendData!.seasonYear ?? null,
            score: backendData!.ratings.tmdb ?? backendData!.ratings.anilist ?? null,
            rating: 'PG-13',
            duration: backendData!.duration ? `${backendData!.duration} min` : '24 min',
            status: backendData!.status || 'RELEASING',
            type: backendData!.format || 'TV',
            genres: backendData!.genres || [],
            studios: backendData!.studios || [],
            episodeCount: verifiedEpCount,
            subCount: verifiedSubCount,
            dubCount: 0,
            synopsis: backendData!.description || '',
            anilistId: targetId,
          };
        }

        if (backendData) {
          const resolvedArt = ArtworkResolver.resolve(backendData);
          if (resolvedArt.poster) base.poster = resolvedArt.poster;
          if (resolvedArt.backdrop) base.banner = resolvedArt.backdrop;
          if (resolvedArt.logo) base.logo = resolvedArt.logo;
          if (resolvedArt.trailer) base.trailer = resolvedArt.trailer;
        }

        if (!isCancelled) {
          setAnime(base);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          console.error('[WatchPage] Failed to load watch anime:', err);
          setError(err instanceof Error ? err.message : 'Failed to load video player');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadWatchAnime();

    return () => {
      isCancelled = true;
    };
  }, [id]);

  const episodes: EpisodeItem[] = useMemo(() => {
    if (!episodesData?.episodes || episodesData.episodes.length === 0) {
      return [];
    }
    return episodesData.episodes.map((ep) => ({
      number: ep.number,
      title: ep.title || `Episode ${ep.number}`,
      synopsis: ep.overview || `Episode ${ep.number} of ${anime?.title || 'the series'}.`,
      aired: ep.airDate || `${anime?.year || ''}`,
      duration: ep.duration ? `${ep.duration}m` : (anime?.duration != null ? `${anime.duration}m` : '24m'),
      durationSec: ep.duration ? ep.duration * 60 : 1440,
      hasSub: true,
      hasDub: Boolean(ep.hasDub),
      kind: ep.isFiller ? 'filler' : 'canon',
      arc: 'Season 1',
      season: 1,
      thumbnail: ep.thumbnail || null,
    }));
  }, [episodesData, anime]);

  const rawEp = epParam ?? searchParams.get('ep') ?? '1';
  const epNum = Math.max(1, Number.parseInt(rawEp, 10) || 1);
  const currentEpisode: EpisodeItem = useMemo(
    () => episodes.find((e) => e.number === epNum) ?? episodes[0] ?? {
      number: 1,
      title: 'Episode 1',
      synopsis: 'Episode 1',
      aired: 'Recent',
      duration: '24m',
      durationSec: 1440,
      hasSub: true,
      hasDub: false,
      kind: 'canon',
      arc: 'Main Arc',
      season: 1,
      thumbnail: null,
    },
    [episodes, epNum]
  );

  const [audioMode, setAudioMode] = useState<'sub' | 'dub'>('sub');
  const [server, setServer] = useState<'default' | 'beta'>(playerPrefs.defaultServer);
  const [backupNoticeDismissed, setBackupNoticeDismissed] = useState(false);
  const [sizePopover, setSizePopover] = useState(false);
  const [synExpanded, setSynExpanded] = useState(false);

  const watchOrder: WatchOrderItem[] = useMemo(() => {
    if (!anime) return [];
    return [
      {
        anime,
        badgeTopLeft: anime.type || 'TV',
        isCurrent: true,
      },
      ...liveRelations.map((rel, idx) => ({
        anime: rel,
        badgeTopLeft: rel.type || `ENTRY ${idx + 2}`,
        isCurrent: false,
      })),
    ];
  }, [anime, liveRelations]);

  const relatedAnime = liveRelations;
  const relatedManga = useMemo(
    () => (anime ? getRelatedMangaForWatch(anime, MANGA_CATALOG, 6) : []),
    [anime]
  );

  useEffect(() => {
    if (audioMode === 'dub' && !currentEpisode.hasDub && currentEpisode.hasSub) {
      setAudioMode('sub');
    }
  }, [audioMode, currentEpisode]);

  const goToEpisode = (n: number) => {
    if (anime) navigate(`/anime/${anime.routeId}?ep=${n}`);
  };

  const hasPrev = currentEpisode.number > 1;
  const hasNext = currentEpisode.number < episodes.length;

  if (isLoading) {
    return (
      <div className="watch-shell">
        <div className="page-shell" style={{ padding: '60px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ height: 480, borderRadius: 16, background: 'rgba(255,255,255,0.06)', animation: 'pulse 1.8s infinite' }} />
        </div>
      </div>
    );
  }

  if (error || !anime) {
    return (
      <div className="watch-shell">
        <div className="page-shell" style={{ padding: '80px 24px' }}>
          <ErrorState
            title="Playback Unavailable"
            message={error || 'Could not find details for this title.'}
            onRetry={() => window.location.reload()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="watch-shell">
      {playerPrefs.lightsOff && (
        <div
          className="watch-lights-backdrop"
          style={{ opacity: 1 - playerPrefs.lightsOffBrightness / 100 }}
          onClick={() => setPlayerPrefs((p) => ({ ...p, lightsOff: false }))}
        />
      )}

      <div className={`watch-grid ${playerPrefs.theaterMode ? 'is-theater' : ''}`}>
        <div>
          <GlassPlayer
            anime={anime}
            episode={currentEpisode}
            audioMode={audioMode}
            server={server}
            hasPrev={hasPrev}
            hasNext={hasNext}
            onPrevEpisode={() => hasPrev && goToEpisode(currentEpisode.number - 1)}
            onNextEpisode={() => hasNext && goToEpisode(currentEpisode.number + 1)}
          />

          {/* Player Controls Toolbar */}
          <div className="watch-toolbar">
            <div className="watch-toolbar__pills">
              <button
                type="button"
                className="watch-pill"
                aria-pressed={playerPrefs.autoplayNext}
                onClick={() => setPlayerPrefs((p) => ({ ...p, autoplayNext: !p.autoplayNext }))}
              >
                <span>{t('watch.autoplay')}</span>
              </button>
              <button
                type="button"
                className="watch-pill"
                aria-pressed={playerPrefs.autoSkip}
                onClick={() => setPlayerPrefs((p) => ({ ...p, autoSkip: !p.autoSkip }))}
              >
                <span>{t('watch.autoskip')}</span>
              </button>
              <button
                type="button"
                className="watch-pill"
                aria-pressed={playerPrefs.theaterMode}
                onClick={() => setPlayerPrefs((p) => ({ ...p, theaterMode: !p.theaterMode }))}
              >
                <Monitor size={13} />
                <span>{t('watch.theater')}</span>
              </button>
              <button
                type="button"
                className="watch-pill"
                aria-pressed={playerPrefs.lightsOff}
                onClick={() => setPlayerPrefs((p) => ({ ...p, lightsOff: !p.lightsOff }))}
              >
                <Lightbulb size={13} />
                <span>{t('watch.lightsOff')}</span>
              </button>
              <button
                type="button"
                className="watch-pill"
                aria-pressed={playerPrefs.ambientMode}
                onClick={() => setPlayerPrefs((p) => ({ ...p, ambientMode: !p.ambientMode }))}
              >
                <Sparkles size={13} />
                <span>{t('watch.ambient')}</span>
              </button>

              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="watch-pill"
                  onClick={() => setSizePopover((p) => !p)}
                >
                  <Sliders size={13} />
                  <span>{t('watch.playerSize')}</span>
                </button>
                {sizePopover && (
                  <div
                    className="facet-popover"
                    style={{ padding: 12, width: 220, bottom: 'calc(100% + 8px)', top: 'auto' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
                      <span>Player width</span>
                      <strong>{playerPrefs.playerSize}%</strong>
                    </div>
                    <input
                      type="range"
                      min={65}
                      max={100}
                      value={playerPrefs.playerSize}
                      onChange={(e) =>
                        setPlayerPrefs((p) => ({ ...p, playerSize: Number(e.target.value) }))
                      }
                      style={{ width: '100%' }}
                    />
                  </div>
                )}
              </div>
              <button
                type="button"
                className="watch-pill"
                onClick={() => {
                  const el = document.querySelector('.glassplayer') as HTMLElement | null;
                  el?.requestFullscreen?.().catch(() => {});
                }}
              >
                <Maximize2 size={13} />
                <span>Fullscreen</span>
              </button>
            </div>

            <div className="watch-toolbar__pills">
              <button
                type="button"
                className="watch-pill watch-pill--icon"
                disabled={!hasPrev}
                aria-label="Previous episode"
                title="Previous episode"
                onClick={() => hasPrev && goToEpisode(currentEpisode.number - 1)}
                style={{ opacity: hasPrev ? 1 : 0.4 }}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className="watch-pill watch-pill--icon"
                disabled={!hasNext}
                aria-label="Next episode"
                title="Next episode"
                onClick={() => hasNext && goToEpisode(currentEpisode.number + 1)}
                style={{ opacity: hasNext ? 1 : 0.4 }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Episode Title & Synopsis */}
          <div style={{ marginTop: 18 }}>
            <h1 style={{ margin: '0 0 6px', fontSize: 21, fontWeight: 700 }}>
              {currentEpisode.number}. {currentEpisode.title}
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: 13.5,
                lineHeight: 1.5,
                color: 'rgb(var(--c-text2))',
                display: synExpanded ? 'block' : '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: synExpanded ? undefined : 2,
                overflow: 'hidden',
              }}
            >
              {currentEpisode.synopsis}
            </p>
            <button
              type="button"
              onClick={() => setSynExpanded((p) => !p)}
              style={{
                marginTop: 4,
                padding: 0,
                border: 0,
                background: 'transparent',
                color: '#9cc3ff',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {synExpanded ? 'Show less' : 'Show more'}
            </button>
          </div>

          {/* Server Notice Banner */}
          {!backupNoticeDismissed && (
            <div className="watch-server-notice">
              <Info size={16} style={{ flexShrink: 0, opacity: 0.78 }} />
              <span style={{ flex: 1 }}>
                Subtitle or audio issues, lag or buffering? Switch servers: the Beta server is recommended, and the Backup server lets you switch location.
              </span>
              <button
                type="button"
                className="yt-icon-button"
                aria-label="Dismiss tip"
                onClick={() => setBackupNoticeDismissed(true)}
                style={{ width: 26, height: 26, flexShrink: 0 }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Audio Mode & Server Picker */}
          <div className="watch-server-row">
            <div className="watch-audio-switch">
              <button
                type="button"
                aria-pressed={audioMode === 'sub'}
                onClick={() => setAudioMode('sub')}
              >
                <Captions size={13} />
                <span>SUB</span>
              </button>
              <button
                type="button"
                aria-pressed={audioMode === 'dub'}
                disabled={!currentEpisode.hasDub}
                style={{ opacity: currentEpisode.hasDub ? 1 : 0.4 }}
                onClick={() => currentEpisode.hasDub && setAudioMode('dub')}
              >
                <Mic size={13} />
                <span>DUB</span>
              </button>
            </div>

            <button
              type="button"
              className={`watch-pill ${server === 'default' ? 'is-server-active' : ''}`}
              onClick={() => {
                setServer('default');
                showToast('Switched to Backup server');
              }}
            >
              <span className="ani-switch" data-checked={server === 'default' ? 'true' : 'false'} />
              <span>Backup server</span>
            </button>

            <button
              type="button"
              className={`watch-pill ${server === 'beta' ? 'is-server-active' : ''}`}
              onClick={() => {
                setServer('beta');
                showToast('Switched to Beta server');
              }}
            >
              <span className="ani-switch" data-checked={server === 'beta' ? 'true' : 'false'} />
              <span>Beta server</span>
            </button>

            <button
              type="button"
              className="watch-pill"
              onClick={() => {
                setServer((s) => (s === 'beta' ? 'default' : 'beta'));
                showToast(server === 'beta' ? 'Switched to Backup server' : 'Switched to Beta server');
              }}
            >
              <Server size={13} />
              <span>Player</span>
            </button>

            <button
              type="button"
              className="watch-pill"
              onClick={() => setReportOpen(true)}
            >
              <Flag size={13} />
              <span>{t('watch.reportProblem')}</span>
            </button>
          </div>

          <WatchAnimeMeta anime={anime} watchOrder={watchOrder} />

          {playerPrefs.theaterMode && (
            <div style={{ marginTop: 28 }}>
              <WatchPlaylistPanel
                episodes={episodes}
                currentEp={currentEpisode.number}
                onSelectEpisode={goToEpisode}
              />
              <WatchSidebarExtras relatedAnime={relatedAnime} relatedManga={relatedManga} />
            </div>
          )}
        </div>

        {!playerPrefs.theaterMode && (
          <div className="watch-aside">
            <WatchPlaylistPanel
              episodes={episodes}
              currentEp={currentEpisode.number}
              onSelectEpisode={goToEpisode}
            />
            <WatchSidebarExtras relatedAnime={relatedAnime} relatedManga={relatedManga} />
          </div>
        )}

        <div className="watch-comments-slot">
          <WatchCommentsSection anime={anime} currentEp={currentEpisode.number} />
        </div>
      </div>
    </div>
  );
};
