import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDownUp,
  ArrowLeft,
  Bell,
  BookOpen,
  ChevronDown,
  Clock,
  Download,
  Eye,
  EyeOff,
  Film,
  Grid,
  List,
  MessageSquare,
  Mic,
  Play,
  Search,
  Share2,
  Sparkles,
  Star,
} from 'lucide-react';
import type { ResolvedAnime, AnimeEpisodeCatalogue } from '@7anime/shared';
import { useAiringCountdown } from '@/src/utils/useAiringCountdown';
import { useApp } from '@/src/context/AppContext';
import {
  MANGA_CATALOG,
  STILLS_POOL,
  getDisplayTitle,
} from '@/src/data/catalogService';
import { filterEpisodeList } from '@/src/utils/catalogFilter';
import { AnimeCard } from '@/src/components/AnimeCard';
import { LibraryStatusTrigger } from '@/src/components/LibraryStatusTrigger';
import { AniListMark, MyAnimeListMark } from '@/src/components/TrackerMarks';
import { AvatarBadge } from '@/src/components/BrandMark';
import { CinematicTrailerBackground } from '@/src/components/CinematicTrailerBackground';
import { apiClient } from '@/src/services/apiClient';
import { ArtworkResolver, ComprehensiveArtwork } from '@/src/services/artworkResolver';
import { AniListService } from '@/src/services/anilist';
import { EpisodeThumbnail } from '@/src/components/EpisodeThumbnail';
import { ErrorState } from '@/src/components/Skeletons';
import type { AnimeTitle, CommentItem, EpisodeItem, EpisodeKind } from '@/src/types/anime';

type DetailTab = 'episodes' | 'related' | 'manga' | 'similar' | 'comments' | 'downloads';

/**
 * Extracts a numeric AniList ID from various slug patterns:
 * e.g. "21" -> 21, "one-piece-21" -> 21
 */
function extractAniListId(rawParam?: string): number | null {
  if (!rawParam) return null;
  const trimmed = rawParam.trim();
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  const match = trimmed.match(/-(\d+)$/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

export const AnimeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, contentPrefs, library, toggleLikeAnime, showToast } = useApp();

  // Live resolved metadata state
  const [anime, setAnime] = useState<AnimeTitle | null>(null);
  const [resolvedAnime, setResolvedAnime] = useState<ResolvedAnime | null>(null);
  const [artwork, setArtwork] = useState<ComprehensiveArtwork | null>(null);
  const [episodesData, setEpisodesData] = useState<AnimeEpisodeCatalogue | null>(null);
  const airingCountdown = useAiringCountdown(resolvedAnime?.nextAiringEpisode ?? null);
  const [liveRelations, setLiveRelations] = useState<AnimeTitle[]>([]);
  const [liveRecommendations, setLiveRecommendations] = useState<AnimeTitle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);

  async function loadDetailData() {
    setIsLoading(true);
    setError(null);
    setLogoError(false);

    // 1. Extract or search AniList ID
    let targetId = extractAniListId(id);
    if (!targetId && id) {
      try {
        const cleanQuery = id.replace(/-/g, ' ');
        const matches = await AniListService.searchPreview(cleanQuery, 1);
        if (matches.length > 0) {
          targetId = matches[0].id;
        }
      } catch (e) {
        console.warn('[AnimeDetailPage] AniList search fallback failed:', e);
      }
    }

    if (!targetId) {
      setIsLoading(false);
      setError(`Anime "${id}" could not be identified.`);
      return;
    }

    try {
      const [backendResolved, anilistDetails, episodesResult, logoResult] = await Promise.allSettled([
        apiClient.getAnimeById(targetId),
        AniListService.getAnimeDetails(targetId),
        apiClient.getEpisodes(targetId),
        apiClient.getLogo(targetId),
      ]);

      const backendData = backendResolved.status === 'fulfilled' ? backendResolved.value : null;
      const anilistData = anilistDetails.status === 'fulfilled' ? anilistDetails.value : null;
      const catData = episodesResult.status === 'fulfilled' ? episodesResult.value : null;
      const directLogo = logoResult.status === 'fulfilled' ? logoResult.value?.logoUrl : undefined;
      if (catData) {
        setEpisodesData(catData);
      }

      if (!backendData && !anilistData) {
        throw new Error(`Failed to load anime with ID ${targetId}`);
      }

      if (anilistData) {
        setLiveRelations(anilistData.related);
        setLiveRecommendations(anilistData.recommendations);
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
        setResolvedAnime(backendData);
        const resolvedArt = ArtworkResolver.resolve(backendData);
        setArtwork(resolvedArt);
        if (resolvedArt.poster) base.poster = resolvedArt.poster;
        if (resolvedArt.backdrop) base.banner = resolvedArt.backdrop;
        if (resolvedArt.logo || directLogo) base.logo = resolvedArt.logo || directLogo;
        if (resolvedArt.trailer) base.trailer = resolvedArt.trailer;
      } else if (directLogo) {
        base.logo = directLogo;
      }

      setAnime(base);
    } catch (err: unknown) {
      console.error('[AnimeDetailPage] Failed to load anime:', err);
      const errMsg = err instanceof Error ? err.message : 'Failed to load anime details';
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDetailData();
  }, [id]);

  const allEpisodes: EpisodeItem[] = useMemo(() => {
    if (!episodesData?.episodes || episodesData.episodes.length === 0) {
      return [];
    }
    return episodesData.episodes.map((ep) => {
      let kind: EpisodeKind = 'unknown';
      if (ep.classification) {
        kind = ep.classification.toLowerCase() as EpisodeKind;
      } else if (ep.isFiller === true) {
        kind = 'filler';
      }
      return {
        number: ep.number,
        title: ep.title || `Episode ${ep.number}`,
        synopsis: ep.overview || `Episode ${ep.number} of ${anime?.title || 'the series'}.`,
        aired: ep.airDate || `${anime?.year || ''}`,
        duration: ep.duration ? `${ep.duration}m` : (anime?.duration != null ? `${anime.duration}m` : '24m'),
        durationSec: ep.duration ? ep.duration * 60 : 1440,
        hasSub: true,
        hasDub: Boolean(ep.hasDub),
        kind,
        classificationSource: ep.classificationSource,
        arc: 'Season 1',
        season: 1,
        thumbnail: ep.thumbnail || null,
      };
    });
  }, [episodesData, anime]);

  const [activeTab, setActiveTab] = useState<DetailTab>('episodes');
  const [expandedSyn, setExpandedSyn] = useState(false);
  const [notifyOn, setNotifyOn] = useState(false);
  const [epSearch, setEpSearch] = useState('');
  const [arcFilter, setArcFilter] = useState('all');
  const [classificationFilter, setClassificationFilter] = useState<'all' | 'canon' | 'mixed' | 'filler'>('all');
  const [sortOrder, setSortOrder] = useState<'oldest' | 'newest'>('oldest');
  const [hideFiller, setHideFiller] = useState(false);
  const [skipFiller, setSkipFiller] = useState(false);
  const [hideSpoilerThumbs, setHideSpoilerThumbs] = useState(false);
  const [gridView, setGridView] = useState(false);
  const [audioFilter, setAudioFilter] = useState<'all' | 'sub' | 'dub'>('all');
  const [epLimit, setEpLimit] = useState(60);
  const [epRange, setEpRange] = useState<string>('all');
  const [showAllTags, setShowAllTags] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>(() => [
    {
      id: 'comm-1',
      username: 'AoiYukari',
      avatar: null,
      avatarColor: '#ec4899',
      isVip: true,
      timeAgo: '2h ago',
      episode: 1,
      body: 'The visual direction and sound design in this episode are phenomenal! One of the best adaptations this year.',
      mediaUrl: null,
      animeTitle: 'Anime',
      routeId: 'anime',
      poster: '',
      likes: 42,
    },
    {
      id: 'comm-2',
      username: 'KageSenshi',
      avatar: null,
      avatarColor: '#6366f1',
      isVip: false,
      timeAgo: '5h ago',
      episode: 1,
      body: 'Can we talk about the animation in the second half? Studio went all out on the keyframes.',
      mediaUrl: null,
      animeTitle: 'Anime',
      routeId: 'anime',
      poster: '',
      likes: 27,
    },
  ]);
  const [commentDraft, setCommentDraft] = useState('');

  useEffect(() => {
    setEpLimit(60);
  }, [id, arcFilter, epSearch, classificationFilter, hideFiller, audioFilter, epRange]);

  const arcs = useMemo(() => Array.from(new Set(allEpisodes.map((e) => e.arc))), [allEpisodes]);
  const canonCount = useMemo(() => allEpisodes.filter((e) => e.kind === 'canon').length, [allEpisodes]);
  const mixedCount = useMemo(() => allEpisodes.filter((e) => e.kind === 'mixed').length, [allEpisodes]);
  const fillerCount = useMemo(() => allEpisodes.filter((e) => e.kind === 'filler').length, [allEpisodes]);

  const epChunks = useMemo(() => {
    if (allEpisodes.length <= 100) return [];
    const chunks: Array<{ label: string; start: number; end: number }> = [];
    for (let i = 0; i < allEpisodes.length; i += 100) {
      const start = i + 1;
      const end = Math.min(i + 100, allEpisodes.length);
      chunks.push({ label: `${start} - ${end}`, start, end });
    }
    return chunks;
  }, [allEpisodes.length]);

  const filteredEpisodes = useMemo(() => {
    let list = allEpisodes;
    if (epRange !== 'all' && !epSearch.trim()) {
      const selectedChunk = epChunks.find((c) => c.label === epRange);
      if (selectedChunk) {
        list = list.filter((e) => e.number >= selectedChunk.start && e.number <= selectedChunk.end);
      }
    }
    return filterEpisodeList(list, {
      arc: arcFilter,
      query: epSearch,
      sortOrder,
      classificationFilter,
      hideFiller,
      audioFilter,
    });
  }, [allEpisodes, epRange, epChunks, arcFilter, epSearch, sortOrder, classificationFilter, hideFiller, audioFilter]);

  const similarTitles = liveRecommendations;
  const relatedTitles = liveRelations;
  const displayTitle = anime ? getDisplayTitle(anime, contentPrefs.titleLanguage === 'original') : '';
  const isLiked = anime ? library.likedIds.includes(anime.routeId) : false;
  const isOngoing = anime ? (anime.status.toLowerCase().includes('releas') || anime.status.toLowerCase().includes('air')) : false;
  const estimatedViews = resolvedAnime?.popularity
    ? resolvedAnime.popularity.toLocaleString()
    : (anime ? (anime.id * 1420).toLocaleString() : '0');

  const kindColor = (kind: EpisodeItem['kind']) => {
    if (kind === 'canon') return '#4ade80';
    if (kind === 'mixed') return '#facc15';
    if (kind === 'filler') return '#fb7185';
    return '#94a3b8';
  };

  // Resolve trailer key for background playback
  const trailerKey = artwork?.trailer?.key || resolvedAnime?.trailer?.key || anime?.trailer?.key || null;
  const backdropUrl = artwork?.backdrop || anime?.banner || anime?.poster || '';

  if (isLoading) {
    return (
      <div className="page-shell" style={{ padding: '60px 24px', display: 'flex', flexDirection: 'column', gap: 32 }}>
        <div style={{ height: 420, borderRadius: 24, background: 'rgba(255,255,255,0.05)', animation: 'pulse 1.8s infinite' }} />
        <div className="browse-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: 180, borderRadius: 12, background: 'rgba(255,255,255,0.04)', animation: 'pulse 1.8s infinite' }} />
          ))}
        </div>
      </div>
    );
  }

  if (error || !anime) {
    return (
      <div className="page-shell" style={{ padding: '80px 24px' }}>
        <ErrorState
          title="Anime Not Found"
          message={error || 'Could not find details for this title.'}
          onRetry={loadDetailData}
        />
      </div>
    );
  }

  return (
    <div>
      <section className="detail-hero">
        {/* Cinematic Trailer Background with Seamless Fallback */}
        <CinematicTrailerBackground
          backdropUrl={backdropUrl}
          trailerKey={trailerKey}
          title={displayTitle}
        />

        <div className="app-content-frame" style={{ position: 'relative', zIndex: 2, marginBottom: 14 }}>
          <button
            type="button"
            className="detail-back-circle"
            onClick={() => navigate(-1)}
            aria-label="Go back"
          >
            <ArrowLeft size={18} />
          </button>
        </div>

        <div className="detail-layout">
          <div className="detail-aside-col">
            <div className="detail-poster">
              <img src={anime.poster} alt={displayTitle} />
            </div>

            <div className="detail-sidebar-meta">
              <div>
                <div className="detail-sidebar-row__label">Format</div>
                <div className="detail-sidebar-row__val">{anime.type}</div>
              </div>
              <div>
                <div className="detail-sidebar-row__label">Total Episodes</div>
                <div className="detail-sidebar-row__val">
                  {episodesData?.totalAnnouncedEpisodes
                    ? episodesData.totalAnnouncedEpisodes.toLocaleString()
                    : isOngoing
                      ? 'Ongoing (TBA)'
                      : anime.episodeCount > 0
                        ? anime.episodeCount.toLocaleString()
                        : '—'}
                </div>
              </div>
              {episodesData?.airedEpisodeCount != null && (
                <div>
                  <div className="detail-sidebar-row__label">Aired Episodes</div>
                  <div className="detail-sidebar-row__val">
                    {episodesData.airedEpisodeCount.toLocaleString()}
                  </div>
                </div>
              )}
              <div>
                <div className="detail-sidebar-row__label">Available Records</div>
                <div className="detail-sidebar-row__val" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span>{allEpisodes.length.toLocaleString()}</span>
                  {episodesData?.completenessStatus === 'complete' ? (
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(74, 222, 128, 0.15)', color: '#4ade80', fontWeight: 600 }}>
                      Complete
                    </span>
                  ) : episodesData?.completenessStatus === 'partial' ? (
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(250, 204, 21, 0.15)', color: '#facc15', fontWeight: 600 }}>
                      Partial
                    </span>
                  ) : episodesData?.completenessStatus === 'resolving' ? (
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(96, 165, 250, 0.15)', color: '#60a5fa', fontWeight: 600 }}>
                      Airing Soon
                    </span>
                  ) : episodesData?.completenessStatus === 'not_applicable' ? (
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(192, 132, 252, 0.15)', color: '#c084fc', fontWeight: 600 }}>
                      Feature / Movie
                    </span>
                  ) : null}
                </div>
              </div>
              <div>
                <div className="detail-sidebar-row__label">Duration</div>
                <div className="detail-sidebar-row__val">
                  {anime.duration ? `${anime.duration} min per episode` : '24 min per episode'}
                </div>
              </div>
              <div>
                <div className="detail-sidebar-row__label">Aired</div>
                <div className="detail-sidebar-row__val">
                  {anime.season ? `${anime.season} ` : ''}
                  {anime.year ?? '—'}
                </div>
              </div>
              {anime.score !== null && (
                <div>
                  <div className="detail-sidebar-row__label">Score</div>
                  <div className="detail-sidebar-row__val" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Star size={13} fill="#ffd35a" color="#ffd35a" />
                    <span>{anime.score.toFixed(1)}</span>
                  </div>
                </div>
              )}
              <div>
                <div className="detail-sidebar-row__label">Views</div>
                <div className="detail-sidebar-row__val" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Eye size={13} style={{ opacity: 0.7 }} />
                  <span>{estimatedViews}</span>
                </div>
              </div>
              <div>
                <div className="detail-sidebar-row__label">Studios</div>
                <div className="detail-sidebar-row__val">
                  {anime.studios.length ? anime.studios.join(', ') : 'Independent'}
                </div>
              </div>
              {anime.season && (
                <div>
                  <div className="detail-sidebar-row__label">Season</div>
                  <div className="detail-sidebar-row__val">
                    {anime.season} {anime.year ?? ''}
                  </div>
                </div>
              )}
              <div>
                <div className="detail-sidebar-row__label">Status</div>
                <div className="detail-sidebar-row__val">
                  {isOngoing ? 'Airing' : 'Finished'}
                </div>
              </div>
              <div>
                <div className="detail-sidebar-row__label">Audio</div>
                <div className="detail-sidebar-row__val">
                  {anime.subCount} sub · {anime.dubCount} dub
                </div>
              </div>
              {anime.rating && (
                <div>
                  <div className="detail-sidebar-row__label">Rated</div>
                  <div className="detail-sidebar-row__val">{anime.rating}</div>
                </div>
              )}
              {anime.native && (
                <div>
                  <div className="detail-sidebar-row__label">Native title</div>
                  <div className="detail-sidebar-row__val">{anime.native}</div>
                </div>
              )}
              {anime.tags && anime.tags.length > 0 && (
                <div>
                  <div className="detail-sidebar-row__label">Tags</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
                    {(showAllTags ? anime.tags : anime.tags.slice(0, 4)).map((tg) => (
                      <Link
                        key={tg}
                        to={`/anime?tag=${encodeURIComponent(tg)}`}
                        style={{
                          padding: '3px 8px',
                          borderRadius: 999,
                          background: 'rgba(255,255,255,0.07)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          fontSize: 11.5,
                          color: 'rgba(255,255,255,0.86)',
                        }}
                      >
                        {tg}
                      </Link>
                    ))}
                    {anime.tags.length > 4 && (
                      <button
                        type="button"
                        onClick={() => setShowAllTags((s) => !s)}
                        style={{
                          padding: '3px 8px',
                          borderRadius: 999,
                          border: '1px solid rgba(255,255,255,0.12)',
                          background: 'transparent',
                          color: '#9cc3ff',
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {showAllTags ? 'Less' : `+${anime.tags.length - 4} more`}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="detail-main-col" style={{ minWidth: 0 }}>
            {anime.logo && !logoError ? (
              <img
                src={anime.logo}
                alt={displayTitle}
                className="spot-logo detail-hero-logo"
                onError={() => setLogoError(true)}
              />
            ) : (
              <h1 className="detail-hero-title">
                {displayTitle}
              </h1>
            )}

            <div className="detail-hero-chips">
              {anime.score !== null && (
                <span className="spot-meta-frost score">
                  <Star size={13} />
                  <span>{anime.score.toFixed(1)}</span>
                </span>
              )}
              {anime.year && <span className="spot-meta-frost">{anime.year}</span>}
              {anime.episodeCount > 0 && (
                <span className="spot-meta-frost">{anime.episodeCount} Episodes</span>
              )}
              {airingCountdown && (
                <span className="spot-meta-frost" style={{ color: '#9cc3ff' }}>
                  <Clock size={12} />
                  <span>{airingCountdown}</span>
                </span>
              )}
              {anime.type && <span className="spot-meta-frost">{anime.type}</span>}
              {anime.genres.slice(0, 3).map((g) => (
                <Link
                  key={g}
                  to={`/anime?genre=${encodeURIComponent(g)}`}
                  className="spot-meta-frost"
                >
                  {g}
                </Link>
              ))}
            </div>

            <p
              className="detail-hero-synopsis"
              style={{
                display: expandedSyn ? 'block' : '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: expandedSyn ? undefined : 3,
                overflow: 'hidden',
              }}
            >
              {anime.synopsis}
            </p>
            {anime.synopsis.length > 160 && (
              <button
                type="button"
                onClick={() => setExpandedSyn((p) => !p)}
                style={{
                  marginTop: 6,
                  padding: 0,
                  border: 0,
                  background: 'transparent',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {expandedSyn ? 'Show less' : 'More'}
              </button>
            )}

            <div className="detail-hero-actions">
              <Link
                to={`/anime/${anime.routeId}?ep=1`}
                className="detail-hero-watch-btn"
              >
                <Play size={17} fill="currentColor" />
                <span>{t('detail.watchNow')}</span>
              </Link>

              <LibraryStatusTrigger routeId={anime.routeId} variant="hero" className="detail-action-circle" />

              <button
                type="button"
                className="detail-action-circle"
                aria-pressed={notifyOn}
                aria-label="Episode notifications"
                title={notifyOn ? 'Notifying' : 'Notify'}
                onClick={() => {
                  setNotifyOn((p) => !p);
                  showToast(notifyOn ? 'Episode alerts off' : 'Episode alerts enabled');
                }}
              >
                <Bell size={17} />
              </button>

              <button
                type="button"
                className="detail-action-circle"
                aria-label="Share anime"
                title="Share"
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href).catch(() => { });
                  showToast('Link copied to clipboard');
                }}
              >
                <Share2 size={17} />
              </button>

              <a
                href={`https://anilist.co/anime/${anime.anilistId ?? ''}`}
                target="_blank"
                rel="noreferrer"
                className="detail-action-circle"
                aria-label="View on AniList"
                title="AniList"
              >
                <AniListMark size={20} />
              </a>

              <a
                href={`https://myanimelist.net/anime/${anime.malId ?? ''}`}
                target="_blank"
                rel="noreferrer"
                className="detail-action-circle"
                aria-label="View on MyAnimeList"
                title="MyAnimeList"
              >
                <MyAnimeListMark size={20} />
              </a>

              {resolvedAnime?.externalIds.imdbId && (
                <a
                  href={`https://www.imdb.com/title/${resolvedAnime.externalIds.imdbId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="detail-action-circle"
                  aria-label="View on IMDb"
                  title={`IMDb: ${resolvedAnime.externalIds.imdbId}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: 10,
                    color: '#f5c518',
                    letterSpacing: -0.2,
                  }}
                >
                  IMDb
                </a>
              )}

              <button
                type="button"
                className="detail-action-circle"
                aria-pressed={isLiked}
                aria-label="Add to Liked"
                title="Favorite / Like"
                onClick={() => {
                  toggleLikeAnime(anime.routeId);
                  showToast(isLiked ? 'Removed like' : 'Added to Liked');
                }}
              >
                <Star size={17} fill={isLiked ? 'currentColor' : 'none'} />
              </button>
            </div>

            {/* Detail Underline Tabs */}
            <div className="underline-tabs" style={{ marginTop: 24 }}>
              {(
                [
                  { id: 'episodes', label: t('detail.episodes'), count: allEpisodes.length, icon: <List size={14} /> },
                  { id: 'related', label: t('detail.related'), count: relatedTitles.length, icon: <Film size={14} /> },
                  { id: 'manga', label: t('detail.manga'), count: 6, icon: <BookOpen size={14} /> },
                  { id: 'similar', label: t('detail.moreLikeThis'), icon: <Sparkles size={14} /> },
                  { id: 'comments', label: t('detail.comments'), count: comments.length || undefined, icon: <MessageSquare size={14} /> },
                  { id: 'downloads', label: t('detail.downloads'), icon: <Download size={14} /> },
                ] as { id: DetailTab; label: string; count?: number; icon: React.ReactNode }[]
              ).map((tb) => (
                <button
                  key={tb.id}
                  type="button"
                  className={`underline-tab ${activeTab === tb.id ? 'is-active' : ''}`}
                  onClick={() => setActiveTab(tb.id)}
                >
                  {tb.icon}
                  <span>{tb.label}</span>
                  {tb.count !== undefined && (
                    <span className="underline-tab__count">{tb.count.toLocaleString()}</span>
                  )}
                </button>
              ))}
            </div>

            {activeTab === 'episodes' && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {arcs.length > 1 && (
                    <div className="watch-select-wrap">
                      <BookOpen size={14} className="watch-select-wrap__icon" />
                      <select
                        className="watch-panel__select watch-panel__select--icon"
                        value={arcFilter}
                        onChange={(e) => setArcFilter(e.target.value)}
                        aria-label="Filter by story arc"
                      >
                        <option value="all">{t('detail.allArcs')}</option>
                        {arcs.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="watch-select-wrap__chev" />
                    </div>
                  )}

                  <div className="browse-search-pill" style={{ width: '100%', height: 38, borderRadius: 12 }}>
                    <Search size={14} style={{ opacity: 0.6 }} />
                    <input
                      type="text"
                      value={epSearch}
                      onChange={(e) => setEpSearch(e.target.value)}
                      placeholder={t('detail.searchEpisodes')}
                    />
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <button
                      type="button"
                      className="watch-pill"
                      onClick={() => setSortOrder((p) => (p === 'oldest' ? 'newest' : 'oldest'))}
                    >
                      <ArrowDownUp size={13} />
                      <span>{sortOrder === 'oldest' ? t('detail.oldest') : t('detail.newest')}</span>
                    </button>

                    <button
                      type="button"
                      className="watch-pill"
                      aria-pressed={gridView}
                      aria-label="Toggle compact number grid"
                      onClick={() => setGridView((p) => !p)}
                      style={{ padding: '0 10px' }}
                    >
                      {gridView ? <List size={14} /> : <Grid size={14} />}
                    </button>

                    <button
                      type="button"
                      className="watch-pill"
                      aria-pressed={hideSpoilerThumbs}
                      aria-label="Toggle spoiler thumbnails"
                      onClick={() => setHideSpoilerThumbs((p) => !p)}
                      style={{ padding: '0 10px' }}
                    >
                      {hideSpoilerThumbs ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>

                    <button
                      type="button"
                      className="watch-pill"
                      aria-pressed={hideFiller}
                      onClick={() => setHideFiller((p) => !p)}
                    >
                      <span>{t('detail.hideFiller')}</span>
                      {fillerCount > 0 && <span style={{ opacity: 0.65 }}>{fillerCount}</span>}
                    </button>

                    <button
                      type="button"
                      className="watch-pill"
                      aria-pressed={skipFiller}
                      onClick={() => setSkipFiller((p) => !p)}
                    >
                      <span>{t('detail.skipFiller')}</span>
                    </button>

                    <button
                      type="button"
                      className="watch-pill"
                      aria-pressed={audioFilter === 'sub'}
                      onClick={() => setAudioFilter((p) => (p === 'sub' ? 'all' : 'sub'))}
                    >
                      <span>{t('detail.subOnly')}</span>
                      <span style={{ opacity: 0.65 }}>{anime.subCount.toLocaleString()}</span>
                    </button>

                    <button
                      type="button"
                      className="watch-pill"
                      aria-pressed={audioFilter === 'dub'}
                      onClick={() => setAudioFilter((p) => (p === 'dub' ? 'all' : 'dub'))}
                    >
                      <span>{t('detail.dubOnly')}</span>
                      <span style={{ opacity: 0.65 }}>{anime.dubCount.toLocaleString()}</span>
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11.5, color: 'rgb(var(--c-text2))', paddingTop: 2 }}>
                    <button
                      type="button"
                      className="watch-pill"
                      aria-pressed={classificationFilter === 'all'}
                      onClick={() => setClassificationFilter('all')}
                      style={{ padding: '0 10px', height: 28 }}
                    >
                      <span>All</span>
                    </button>
                    <button
                      type="button"
                      className="watch-pill"
                      aria-pressed={classificationFilter === 'canon'}
                      onClick={() => setClassificationFilter((p) => (p === 'canon' ? 'all' : 'canon'))}
                      style={{ padding: '0 10px', height: 28 }}
                    >
                      <i style={{ color: '#4ade80' }}>●</i>
                      <span>Canon: Main story</span>
                      {canonCount > 0 && <span style={{ opacity: 0.65 }}>{canonCount}</span>}
                    </button>
                    <button
                      type="button"
                      className="watch-pill"
                      aria-pressed={classificationFilter === 'mixed'}
                      onClick={() => setClassificationFilter((p) => (p === 'mixed' ? 'all' : 'mixed'))}
                      style={{ padding: '0 10px', height: 28 }}
                    >
                      <i style={{ color: '#facc15' }}>●</i>
                      <span>Mixed: Canon + filler</span>
                      {mixedCount > 0 && <span style={{ opacity: 0.65 }}>{mixedCount}</span>}
                    </button>
                    <button
                      type="button"
                      className="watch-pill"
                      aria-pressed={classificationFilter === 'filler'}
                      onClick={() => setClassificationFilter((p) => (p === 'filler' ? 'all' : 'filler'))}
                      style={{ padding: '0 10px', height: 28 }}
                    >
                      <i style={{ color: '#fb7185' }}>●</i>
                      <span>Filler: Anime-original</span>
                      {fillerCount > 0 && <span style={{ opacity: 0.65 }}>{fillerCount}</span>}
                    </button>
                  </div>
                </div>

                {/* Catalogue Completeness and Count Bar */}
                {episodesData && (
                  <div style={{ margin: '14px 0 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '10px 14px', borderRadius: 12, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.07)' }}>
                    <div style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.8)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span>
                        Showing <strong>{filteredEpisodes.length.toLocaleString()}</strong> of <strong>{allEpisodes.length.toLocaleString()}</strong> verified episodes
                      </span>
                      {episodesData.completenessStatus === 'complete' && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(74, 222, 128, 0.15)', color: '#4ade80', fontWeight: 600 }}>
                          Complete Verified Catalogue
                        </span>
                      )}
                      {episodesData.completenessStatus === 'partial' && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(250, 204, 21, 0.15)', color: '#facc15', fontWeight: 600 }}>
                          Partial Catalogue ({episodesData.verifiedRecordsCount} of {episodesData.airedEpisodeCount} Aired)
                        </span>
                      )}
                      {episodesData.completenessStatus === 'resolving' && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(96, 165, 250, 0.15)', color: '#60a5fa', fontWeight: 600 }}>
                          Airing Schedule / Upcoming
                        </span>
                      )}
                      {episodesData.completenessStatus === 'not_applicable' && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(192, 132, 252, 0.15)', color: '#c084fc', fontWeight: 600 }}>
                          Single Installment Feature
                        </span>
                      )}
                      {(episodesData.completenessStatus === 'metadata_unavailable' || episodesData.completenessStatus === 'unavailable') && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', fontWeight: 600 }}>
                          Detailed Episode Listing Pending
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Episode Range Selector for Long Series (e.g. One Piece, Bleach) */}
                {epChunks.length > 0 && !epSearch.trim() && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0 14px' }}>
                    <button
                      type="button"
                      className="watch-pill"
                      aria-pressed={epRange === 'all'}
                      onClick={() => setEpRange('all')}
                      style={{ height: 30, fontSize: 11.5, padding: '0 12px' }}
                    >
                      All ({allEpisodes.length.toLocaleString()})
                    </button>
                    {epChunks.map((chunk) => (
                      <button
                        key={chunk.label}
                        type="button"
                        className="watch-pill"
                        aria-pressed={epRange === chunk.label}
                        onClick={() => setEpRange(chunk.label)}
                        style={{ height: 30, fontSize: 11.5, padding: '0 12px' }}
                      >
                        {chunk.label}
                      </button>
                    ))}
                  </div>
                )}

                {filteredEpisodes.length === 0 ? (
                  <div style={{ padding: '36px 20px', textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: 14, marginTop: 14 }}>
                    <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
                      {epSearch
                        ? `No episodes matching "${epSearch}".`
                        : episodesData?.completenessStatus === 'resolving'
                          ? 'This title is scheduled or currently preparing its release. Episode listings and air schedules will appear as broadcast dates approach.'
                          : episodesData?.completenessStatus === 'not_applicable'
                            ? 'This release is a single installment or non-episodic feature.'
                            : anime?.episodeCount
                              ? `Total verified episodes: ${anime.episodeCount}. Detailed individual episode breakdown is pending metadata submission from upstream providers.`
                              : 'No episode records available.'}
                    </p>
                  </div>
                ) : gridView ? (
                  <div className="ep-num-grid ep-num-grid--detail">
                    {filteredEpisodes.slice(0, epLimit * 2).map((ep) => (
                      <Link
                        key={ep.number}
                        to={`/anime/${anime.routeId}?ep=${ep.number}`}
                        className="ep-num-btn"
                        aria-label={`Episode ${ep.number}`}
                      >
                        <span>{ep.number}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="detail-ep-grid">
                    {filteredEpisodes.slice(0, epLimit).map((ep) => (
                      <Link
                        key={ep.number}
                        to={`/anime/${anime.routeId}?ep=${ep.number}`}
                        className="detail-ep-card"
                      >
                        <div className="detail-ep-thumb">
                          <EpisodeThumbnail
                            src={ep.thumbnail}
                            alt={ep.title}
                            episodeNumber={ep.number}
                            hideThumbs={hideSpoilerThumbs}
                            fontSize={28}
                          />
                          <span className="detail-ep-badge-tl">
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: kindColor(ep.kind) }} />
                            <span>Episode {ep.number}</span>
                            {ep.kind !== 'unknown' && (
                              <span style={{ fontSize: 10, opacity: 0.85, textTransform: 'capitalize', fontWeight: 600 }}>({ep.kind})</span>
                            )}
                          </span>
                          {ep.hasDub && (
                            <span className="detail-ep-badge-bl">
                              <Mic size={10} />
                              <span>DUB</span>
                            </span>
                          )}
                          <span className="detail-ep-duration">{ep.duration}</span>
                        </div>

                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ fontSize: 14, fontWeight: 650, lineHeight: 1.3 }}>{ep.title}</div>
                          <p
                            style={{
                              margin: 0,
                              fontSize: 12,
                              color: 'rgb(var(--c-text2))',
                              display: '-webkit-box',
                              WebkitBoxOrient: 'vertical',
                              WebkitLineClamp: 2,
                              overflow: 'hidden',
                            }}
                          >
                            {ep.synopsis}
                          </p>
                          <div style={{ marginTop: 'auto', fontSize: 11.5, color: 'rgb(var(--c-text3))' }}>
                            {ep.aired}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                {filteredEpisodes.length > (gridView ? epLimit * 2 : epLimit) && (
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
                    <button
                      type="button"
                      className="watch-pill"
                      onClick={() => setEpLimit((n) => n + 60)}
                      style={{ height: 40, padding: '0 20px' }}
                    >
                      <span>
                        Load more episodes (
                        {(filteredEpisodes.length - (gridView ? epLimit * 2 : epLimit)).toLocaleString()} remaining)
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'related' && (
              <div className="browse-grid" style={{ marginTop: 18 }}>
                {relatedTitles.map((r) => (
                  <AnimeCard key={r.routeId} anime={r} variant="grid" />
                ))}
              </div>
            )}

            {activeTab === 'manga' && (
              <div className="settings-card" style={{ marginTop: 18 }}>
                <h3 style={{ margin: '0 0 8px' }}>Read source manga</h3>
                <p style={{ margin: '0 0 14px', color: 'rgb(var(--c-text2))', fontSize: 13.5 }}>
                  Jump right into the manga adaptation chapters in the built-in Toonkotsu reader.
                </p>
                <Link
                  to={`/manga/${(MANGA_CATALOG[0]?.slug ?? anime.slug)}/1`}
                  className="watch-pill"
                  aria-pressed="true"
                >
                  Open Manga Reader
                </Link>
              </div>
            )}

            {activeTab === 'similar' && (
              <div className="browse-grid" style={{ marginTop: 18 }}>
                {similarTitles.map((s) => (
                  <AnimeCard key={s.routeId} anime={s} variant="grid" />
                ))}
              </div>
            )}

            {activeTab === 'comments' && (
              <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!commentDraft.trim()) return;
                    setComments((prev) => [
                      {
                        id: `c-${Date.now()}`,
                        username: 'You',
                        avatar: null,
                        timeAgo: 'Just now',
                        episode: 1,
                        body: commentDraft.trim(),
                        animeTitle: anime.title,
                        routeId: anime.routeId,
                        poster: anime.poster,
                      },
                      ...prev,
                    ]);
                    setCommentDraft('');
                  }}
                  style={{ display: 'flex', gap: 10 }}
                >
                  <input
                    type="text"
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder={`Comment on ${anime.title}...`}
                    className="ytdlg-field"
                  />
                  <button type="submit" className="watch-pill" aria-pressed="true" style={{ height: 40, padding: '0 18px' }}>
                    Post
                  </button>
                </form>

                {comments.map((c) => (
                  <div key={c.id} className="settings-card" style={{ padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <AvatarBadge username={c.username} avatar={c.avatar} size={24} />
                      <strong style={{ fontSize: 13 }}>{c.username}</strong>
                      <span style={{ fontSize: 11.5, color: 'rgb(var(--c-text2))' }}>{c.timeAgo}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 13.5 }}>{c.body}</p>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'downloads' && (
              <div className="settings-card" style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>Direct offline episode packages</h3>
                <p style={{ margin: 0, fontSize: 13, color: 'rgb(var(--c-text2))' }}>
                  Select a stream encode for offline playback.
                </p>
                {filteredEpisodes.slice(0, 5).map((ep) => (
                  <div
                    key={ep.number}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.04)',
                    }}
                  >
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                      EP {ep.number} — {ep.title} (1080p MP4)
                    </span>
                    <a
                      href="/assets/media/sample-episode.mp4"
                      download={`${anime.slug}-ep-${ep.number}.mp4`}
                      className="watch-pill"
                    >
                      <Download size={13} />
                      <span>Download</span>
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
