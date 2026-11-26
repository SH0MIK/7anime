import React, { useEffect, useRef } from 'react';
import type { ResolvedEmbedResult } from '@/src/services/player';

export interface EmbedFrameProps {
  resolved: ResolvedEmbedResult;
  title: string;
  reloadKey: number;
  onLoad?: () => void;
  onError?: () => void;
}

interface HlsInstance {
  loadSource: (url: string) => void;
  attachMedia: (media: HTMLMediaElement) => void;
  destroy: () => void;
  on: (event: string, callback: (_event: string, data: { fatal?: boolean }) => void) => void;
}

interface HlsConstructor {
  new (config?: Record<string, unknown>): HlsInstance;
  isSupported: () => boolean;
  Events: { ERROR: string; MANIFEST_PARSED: string };
}

declare global {
  interface Window {
    Hls?: HlsConstructor;
  }
}

let hlsScriptPromise: Promise<void> | null = null;

function loadHlsLibrary(): Promise<void> {
  if (window.Hls) return Promise.resolve();
  if (hlsScriptPromise) return hlsScriptPromise;

  hlsScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-hlsjs-loader]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Unable to load HLS playback engine.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.6.15/dist/hls.min.js';
    script.async = true;
    script.dataset.hlsjsLoader = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Unable to load HLS playback engine.'));
    document.head.appendChild(script);
  }).catch((error) => {
    hlsScriptPromise = null;
    throw error;
  });

  return hlsScriptPromise;
}

export const EmbedFrame: React.FC<EmbedFrameProps> = ({ resolved, title, reloadKey, onLoad, onError }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    const source = resolved.hlsProxyUrl || resolved.embedUrl;
    if (!video || !resolved.ok || !source) return;

    let disposed = false;
    let hls: HlsInstance | null = null;

    const handleLoaded = () => onLoad?.();
    const handleVideoError = () => onError?.();
    video.addEventListener('loadeddata', handleLoaded);
    video.addEventListener('error', handleVideoError);

    const start = async () => {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = source;
        video.load();
        return;
      }

      await loadHlsLibrary();
      if (disposed) return;
      const Hls = window.Hls;
      if (!Hls || !Hls.isSupported()) {
        throw new Error('This browser does not support HLS playback.');
      }

      hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal && !disposed) onError?.();
      });
      hls.loadSource(source);
      hls.attachMedia(video);
    };

    start().catch((error) => {
      console.error('[AniVault HLS] Playback initialization failed:', error);
      if (!disposed) onError?.();
    });

    return () => {
      disposed = true;
      video.removeEventListener('loadeddata', handleLoaded);
      video.removeEventListener('error', handleVideoError);
      hls?.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [resolved.ok, resolved.hlsProxyUrl, resolved.embedUrl, reloadKey, onLoad, onError]);

  if (!resolved.ok || !(resolved.hlsProxyUrl || resolved.embedUrl)) return null;

  return (
    <video
      key={reloadKey}
      ref={videoRef}
      className="glassplayer__embed-iframe"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        border: 0,
        background: '#06070b',
        zIndex: 1,
        objectFit: 'contain',
      }}
      controls
      crossOrigin="anonymous"
      playsInline
      preload="metadata"
      aria-label={title}
    >
      {(resolved.subtitles || []).map((track, index) => (
        <track
          key={track.url || track.src || index}
          kind="subtitles"
          src={track.url || track.src}
          srcLang={track.lang || 'und'}
          label={track.label}
          default={Boolean(track.default)}
        />
      ))}
    </video>
  );
};

EmbedFrame.displayName = 'EmbedFrame';
