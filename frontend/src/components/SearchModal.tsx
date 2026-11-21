import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic, Search, X } from 'lucide-react';
import { useApp } from '@/src/context/AppContext';
import type { AnimeTitle } from '@/src/types/anime';
import { AnimeCard } from './AnimeCard';
import { AniListService } from '@/src/services/anilist';
import { GridSkeleton } from './Skeletons';

export const SearchModal: React.FC = () => {
  const {
    t,
    searchOpen,
    setSearchOpen,
    recentSearches,
    addRecentSearch,
    clearRecentSearches,
    showToast,
  } = useApp();

  const [mode, setMode] = useState<'titles' | 'describe'>('titles');
  const [query, setQuery] = useState('');
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (searchOpen) {
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const len = inputRef.current.value.length;
          inputRef.current.setSelectionRange?.(len, len);
        }
      }, 40);

      const onModalKey = (e: KeyboardEvent) => {
        if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
          const target = e.target as HTMLElement | null;
          if (target !== inputRef.current && (!target || !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }
      };

      window.addEventListener('keydown', onModalKey);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('keydown', onModalKey);
      };
    } else {
      setListening(false);
    }
  }, [searchOpen]);

  const [results, setResults] = useState<AnimeTitle[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) {
      setResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    const timer = window.setTimeout(async () => {
      try {
        const liveResults = await AniListService.searchPreview(clean, 18);
        setResults(liveResults);
      } catch (err: unknown) {
        console.error('[SearchModal] AniList search failed:', err);
        setSearchError('Live search request failed. Please check your connection.');
      } finally {
        setIsSearching(false);
      }
    }, 280);

    return () => window.clearTimeout(timer);
  }, [query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) addRecentSearch(query.trim());
  };

  const handleVoiceDemo = () => {
    setListening(true);
    setTimeout(() => {
      setListening(false);
      setQuery(mode === 'describe' ? 'cyberpunk neon city' : 'One Piece');
      showToast('Voice input captured');
    }, 650);
  };

  if (!searchOpen) return null;

  return createPortal(
    <div
      className="search-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('search.heading')}
      onClick={(e) => {
        if (e.target === e.currentTarget) setSearchOpen(false);
      }}
    >
      <div className="search-overlay__inner">
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div>
            <h2
              style={{
                margin: '0 0 16px',
                fontSize: 'clamp(34px, 4.5vw, 52px)',
                fontWeight: 650,
                letterSpacing: '-0.03em',
                lineHeight: 1.04,
                color: '#ffffff',
              }}
            >
              Search 7Anime
            </h2>

            <div
              style={{
                display: 'inline-flex',
                padding: 3,
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.06)',
              }}
            >
              <button
                type="button"
                onClick={() => setMode('titles')}
                style={{
                  height: 30,
                  padding: '0 16px',
                  border: 0,
                  borderRadius: 999,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  background: mode === 'titles' ? '#ffffff' : 'transparent',
                  color: mode === 'titles' ? '#09090b' : 'rgba(255,255,255,0.72)',
                }}
              >
                {t('search.titlesTab')}
              </button>
              <button
                type="button"
                onClick={() => setMode('describe')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  height: 30,
                  padding: '0 16px',
                  border: 0,
                  borderRadius: 999,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  background: mode === 'describe' ? '#ffffff' : 'transparent',
                  color: mode === 'describe' ? '#09090b' : 'rgba(255,255,255,0.72)',
                }}
              >
                <span>{t('search.describeTab')}</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            className="yt-icon-button"
            aria-label="Close search"
            onClick={() => setSearchOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              width: 'min(520px, 100%)',
              height: 48,
              padding: '0 10px 0 16px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.06)',
            }}
          >
            <Search size={17} style={{ opacity: 0.7, flexShrink: 0 }} />
            <input
              ref={inputRef}
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                mode === 'describe'
                  ? 'Describe a plot, vibe, or character...'
                  : 'Search anime...'
              }
              style={{
                flex: '1 1 auto',
                minWidth: 0,
                border: 0,
                background: 'transparent',
                color: '#ffffff',
                fontSize: 15,
                outline: 'none',
              }}
            />
            {query && (
              <button
                type="button"
                className="yt-icon-button"
                aria-label="Clear search query"
                onClick={() => setQuery('')}
              >
                <X size={16} />
              </button>
            )}
            <button
              type="button"
              className="yt-icon-button"
              aria-label="Voice search"
              onClick={handleVoiceDemo}
              style={{
                color: listening ? '#f87171' : 'rgba(255,255,255,0.78)',
              }}
            >
              <Mic size={17} />
            </button>
          </div>
        </form>

        <p style={{ marginTop: 12, fontSize: 13, color: 'rgba(255,255,255,0.58)' }}>
          {mode === 'describe' ? t('search.describeHint') : t('search.typeHint')}
        </p>

        {recentSearches.length > 0 && query.trim().length < 2 && (
          <div style={{ marginTop: 20 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(255,255,255,0.48)' }}>
                Recent searches
              </span>
              <button
                type="button"
                onClick={clearRecentSearches}
                style={{
                  border: 0,
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.55)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Clear
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {recentSearches.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => setQuery(term)}
                  className="watch-pill"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        )}

        {query.trim().length >= 2 && (
          <div style={{ marginTop: 24 }}>
            {isSearching ? (
              <>
                <p style={{ margin: '0 0 14px', fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
                  Searching AniList catalog...
                </p>
                <GridSkeleton count={6} />
              </>
            ) : searchError ? (
              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#f87171' }}>
                {searchError}
              </p>
            ) : (
              <>
                <p style={{ margin: '0 0 14px', fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
                  {results.length > 0
                    ? `${results.length} matching titles`
                    : `No titles matched "${query}"`}
                </p>
                {results.length > 0 && (
                  <div
                    className="browse-grid"
                    onClick={() => {
                      addRecentSearch(query);
                      setSearchOpen(false);
                    }}
                  >
                    {results.map((anime) => (
                      <AnimeCard key={anime.routeId} anime={anime} variant="grid" />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
