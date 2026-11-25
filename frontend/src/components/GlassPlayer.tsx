import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { AnimeTitle, EpisodeItem } from '@/src/types/anime';
import { useApp } from '@/src/context/AppContext';
import { discordPresenceService } from '@/src/services/discordPresenceService';
import { discordPresenceCoordinator } from '@/src/services/discordPresenceCoordinator';
import {
  ORDERED_SERVER_IDS,
  SERVER_DESCRIPTORS,
  parseEmbedProgressMessage,
  resolvePlayerEmbed,
  type PlayerServerId,
  type ResolvedEmbedResult,
} from '@/src/services/player';
import { EmbedFrame } from './EmbedFrame';

interface GlassPlayerProps {
  anime: AnimeTitle;
  episode: EpisodeItem;
  audioMode: 'sub' | 'dub';
  server: PlayerServerId;
  resolvedEmbed?: ResolvedEmbedResult;
  onSelectServer?: (next: PlayerServerId) => void;
  onPrevEpisode?: () => void;
  onNextEpisode?: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

const IFRAME_LOAD_TIMEOUT_MS = 24000;

export const GlassPlayer: React.FC<GlassPlayerProps> = ({
  anime,
  episode,
  audioMode,
  server,
  resolvedEmbed: resolvedEmbedProp,
  onSelectServer,
  onNextEpisode,
  hasNext,
}) => {
  const { playerPrefs, logWatchProgress } = useApp();

  const resolvedEmbed = useMemo(
    () =>
      resolvedEmbedProp ??
      resolvePlayerEmbed({
        server,
        anilistId: anime.anilistId ?? anime.id,
        malId: anime.malId,
        tmdbId: anime.tmdbId,
        mediaType: anime.mediaType,
        seasonNumber: episode.season,
        episodeNumber: episode.number,
        tmdbEpisodeNumber: episode.tmdbEpisodeNumber,
        audioMode,
        autoplay: playerPrefs.autoplayNext,
      }),
    [
      resolvedEmbedProp,
      server,
      anime.anilistId,
      anime.id,
      anime.malId,
      anime.tmdbId,
      anime.mediaType,
      episode.season,
      episode.number,
      episode.tmdbEpisodeNumber,
      audioMode,
      playerPrefs.autoplayNext,
    ]
  );

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [osd, setOsd] = useState<string | null>(null);

  const lastLoggedRef = useRef<{ sec: number; at: number }>({ sec: -1, at: 0 });
  const hasStartedPresenceRef = useRef(false);

  const activeEmbedKey = useMemo(
    () => `${resolvedEmbed.serverId}::${resolvedEmbed.embedUrl ?? 'none'}::${reloadKey}`,
    [resolvedEmbed.serverId, resolvedEmbed.embedUrl, reloadKey]
  );
  const activeEmbedKeyRef = useRef(activeEmbedKey);
  activeEmbedKeyRef.current = activeEmbedKey;

  const flashOsd = useCallback(
    (label: string) => {
      setOsd(label);
      window.setTimeout(
        () => setOsd((curr) => (curr === label ? null : curr)),
        playerPrefs.toastDurationSec * 1000
      );
    },
    [playerPrefs.toastDurationSec]
  );

  // Reset iframe lifecycle state cleanly whenever anime, episode, server, or embed URL changes
  useEffect(() => {
    setIframeLoaded(false);
    setIframeError(false);
    setTimedOut(false);
    setProviderError(null);
    lastLoggedRef.current = { sec: -1, at: 0 };

    if (!resolvedEmbed.ok || !resolvedEmbed.embedUrl) {
      return;
    }

    const capturedKey = activeEmbedKey;
    const timer = window.setTimeout(() => {
      if (activeEmbedKeyRef.current !== capturedKey) return;
      setIframeLoaded((loaded) => {
        if (!loaded) {
          setTimedOut(true);
        }
        return loaded;
      });
    }, IFRAME_LOAD_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeEmbedKey, resolvedEmbed.ok, resolvedEmbed.embedUrl]);

  // Listen to cross-origin postMessage events from the currently active iframe only
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        iframeRef.current?.contentWindow &&
        event.source &&
        event.source !== iframeRef.current.contentWindow
      ) {
        return;
      }

      const raw = event.data;
      if (raw && typeof raw === 'object') {
        const record = raw as Record<string, unknown>;
        if (record.source === 'animetvplus-embed') {
          if (record.type === 'ready') {
            setIframeLoaded(true);
            setTimedOut(false);
            setProviderError(null);
          } else if (record.type === 'error') {
            setIframeLoaded(true);
            setTimedOut(false);
            if (record.error === 'unknown_title') {
              setProviderError(
                `Title not found on Server 1 (AniList ID ${resolvedEmbed.resolvedIdentifiers.anilistId}). Please switch to Beta server or Backup server.`
              );
            } else if (record.error === 'no_episode') {
              setProviderError(
                `Episode ${episode.number} is not available on Server 1 yet. Please try Beta server or Backup server.`
              );
            }
          }
          return;
        }
      }

      if (!resolvedEmbed.capabilities.progressPostMessage) {
        return;
      }

      const progress = parseEmbedProgressMessage(event);
      if (!progress) return;

      setIframeLoaded(true);
      setTimedOut(false);

      const dur =
        progress.durationSeconds > 0
          ? progress.durationSeconds
          : episode.durationSec || 1440;
      const pos = Math.max(0, Math.min(dur, progress.progressSeconds));
      const now = Date.now();

      const shouldPersist =
        progress.completed ||
        progress.isPaused ||
        now - lastLoggedRef.current.at >= 10000 ||
        Math.abs(pos - lastLoggedRef.current.sec) >= 15;

      if (shouldPersist) {
        lastLoggedRef.current = { sec: pos, at: now };
        logWatchProgress(anime.routeId, episode.number, pos, dur, audioMode);
      }

      if (
        progress.completed &&
        resolvedEmbed.capabilities.autoNext &&
        playerPrefs.autoplayNext &&
        hasNext &&
        onNextEpisode
      ) {
        onNextEpisode();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [
    anime.routeId,
    audioMode,
    episode.durationSec,
    episode.number,
    hasNext,
    logWatchProgress,
    onNextEpisode,
    playerPrefs.autoplayNext,
    resolvedEmbed.capabilities.autoNext,
    resolvedEmbed.capabilities.progressPostMessage,
    resolvedEmbed.resolvedIdentifiers.anilistId,
  ]);

  // Synchronize Discord Rich Presence when embed stream finishes loading
  useEffect(() => {
    if (iframeLoaded && resolvedEmbed.ok && !iframeError && !providerError) {
      hasStartedPresenceRef.current = true;
      discordPresenceCoordinator.claimLeadership(anime.routeId);
      discordPresenceService.updatePlayback({
        animeTitle: anime.title,
        routeId: anime.routeId,
        episodeNumber: episode.number,
        seasonNumber: episode.season || 1,
        isPlaying: true,
        currentTimeSec: Math.max(0, Math.floor(lastLoggedRef.current.sec || 0)),
        durationSec: episode.durationSec || 1440,
        startTimestamp: Date.now(),
      });
    }
  }, [
    iframeLoaded,
    resolvedEmbed.ok,
    iframeError,
    providerError,
    anime.title,
    anime.routeId,
    episode.number,
    episode.season,
    episode.durationSec,
  ]);

  // Clean up Discord activity on episode change or unmount
  useEffect(() => {
    return () => {
      if (hasStartedPresenceRef.current) {
        hasStartedPresenceRef.current = false;
        discordPresenceService.clearActivity();
        discordPresenceCoordinator.releaseLeadership();
      }
    };
  }, [anime.routeId, episode.number]);

  const handleIframeLoad = useCallback(() => {
    if (activeEmbedKeyRef.current !== activeEmbedKey) return;
    setIframeLoaded(true);
    setTimedOut(false);
    setIframeError(false);

    // Record watch history entry once embed initializes (works for all providers)
    const dur = episode.durationSec || 1440;
    if (lastLoggedRef.current.at === 0) {
      lastLoggedRef.current = { sec: 0, at: Date.now() };
      logWatchProgress(anime.routeId, episode.number, 0, dur, audioMode);
    }
  }, [activeEmbedKey, anime.routeId, audioMode, episode.durationSec, episode.number, logWatchProgress]);

  const handleIframeError = useCallback(() => {
    if (activeEmbedKeyRef.current !== activeEmbedKey) return;
    setIframeError(true);
    setIframeLoaded(false);
  }, [activeEmbedKey]);

  const handleRetry = useCallback(() => {
    setIframeLoaded(false);
    setIframeError(false);
    setTimedOut(false);
    setProviderError(null);
    setReloadKey((k) => k + 1);
    flashOsd('Reloading stream');
  }, [flashOsd]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const heroArt = anime.banner ?? episode.thumbnail ?? anime.poster;
  const serverMeta = SERVER_DESCRIPTORS[server];
  const hasBlockingError =
    !resolvedEmbed.ok || iframeError || timedOut || Boolean(providerError);
  const isWaitingForIframe =
    resolvedEmbed.ok && !iframeLoaded && !iframeError && !timedOut && !providerError;

  const displayErrorText =
    providerError ||
    (!resolvedEmbed.ok ? resolvedEmbed.errorMessage : null) ||
    (timedOut
      ? `${serverMeta.label} timed out while loading the player. Please retry or switch servers.`
      : iframeError
        ? `Unable to load ${serverMeta.label}. Please retry or switch to another server.`
        : null);

  return (
    <div
      className="glassplayer-wrap"
      style={{ width: `${playerPrefs.playerSize}%`, maxWidth: '100%', marginInline: 'auto' }}
    >
      {playerPrefs.ambientMode && (
        <div
          className="glassplayer-ambient"
          style={{
            backgroundImage: `url(${heroArt})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
          aria-hidden="true"
        />
      )}

      <div
        ref={containerRef}
        className={`glassplayer ${playerPrefs.theaterMode ? 'is-theater' : ''}`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key.toLowerCase() === 'f') {
            toggleFullscreen();
          }
        }}
      >
        <div
          className="glassplayer__blank-placeholder"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#06070b' }}
        >
          {resolvedEmbed.ok && !providerError ? (
            <EmbedFrame
              ref={iframeRef}
              resolved={resolvedEmbed}
              title={`${anime.title} — Episode ${episode.number} (${serverMeta.label})`}
              reloadKey={reloadKey}
              onLoad={handleIframeLoad}
              onError={handleIframeError}
            />
          ) : (
            <div
              className="glassplayer__poster-layer"
              style={{ backgroundImage: `url(${heroArt})`, opacity: 0.32 }}
              aria-hidden="true"
            />
          )}
        </div>

        {(isWaitingForIframe || hasBlockingError) && (
          <div
            className="glassplayer__poster-layer"
            style={{ backgroundImage: `url(${heroArt})`, zIndex: 2 }}
            aria-hidden="true"
          />
        )}

        {(isWaitingForIframe || hasBlockingError) && (
          <div
            className="glassplayer__pause-overlay"
            style={{
              zIndex: 3,
              pointerEvents: hasBlockingError ? 'auto' : 'none',
              justifyContent: 'center',
              alignItems: 'flex-start',
              padding: '28px 30px',
              background: hasBlockingError
                ? 'linear-gradient(180deg, rgba(6, 7, 11, 0.72) 0%, rgba(6, 7, 11, 0.9) 100%)'
                : 'linear-gradient(180deg, rgba(0, 0, 0, 0.25) 0%, rgba(0, 0, 0, 0.75) 100%)',
            }}
          >
            <span className="glassplayer__pause-eyebrow">
              {anime.title} · Episode {episode.number}
              {serverMeta.capabilities.supportsSubDub ? ` · ${audioMode.toUpperCase()}` : ''} · {serverMeta.label}
            </span>
            <h2 className="glassplayer__pause-title">{episode.title}</h2>
            {hasBlockingError ? (
              <>
                <p className="glassplayer__pause-sub" style={{ maxWidth: 560, marginTop: 6 }}>
                  {displayErrorText}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                  {resolvedEmbed.ok && (
                    <button
                      type="button"
                      className="watch-pill"
                      onClick={handleRetry}
                      aria-pressed="true"
                    >
                      <RefreshCw size={13} />
                      <span>Retry {serverMeta.label}</span>
                    </button>
                  )}
                  {onSelectServer &&
                    ORDERED_SERVER_IDS.filter((id) => id !== server).map((altId) => (
                      <button
                        key={altId}
                        type="button"
                        className="watch-pill"
                        onClick={() => onSelectServer(altId)}
                      >
                        <span>Switch to {SERVER_DESCRIPTORS[altId].label}</span>
                      </button>
                    ))}
                </div>
              </>
            ) : (
              <p className="glassplayer__pause-sub" style={{ marginTop: 6 }}>
                Connecting to {serverMeta.label} ({serverMeta.shortDescription})...
              </p>
            )}
          </div>
        )}

        {osd && (
          <div
            className={`glassplayer__osd ${
              playerPrefs.toastPosition === 'center' ? 'glassplayer__osd--center' : 'glassplayer__osd--top'
            }`}
            style={{ zIndex: 7 }}
          >
            {osd}
          </div>
        )}
      </div>
    </div>
  );
};
