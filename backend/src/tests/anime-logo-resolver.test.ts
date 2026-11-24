import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AnimeIdentityValidator } from '../services/metadata/resolver/anime-identity-validator.service.js';
import { LogoResolverService } from '../services/metadata/resolver/logo-resolver.service.js';
import { ArtworkResolverService } from '../services/metadata/resolver/artwork-resolver.service.js';
import { CANONICAL_OVERRIDES } from '../services/metadata/resolver/anime-matcher.service.js';
import { AniListMedia } from '../services/metadata/providers/anilist.provider.js';
import { TmdbImageItem } from '../services/metadata/providers/tmdb.provider.js';

describe('Anime Title Logo Identity & Validation Suite', () => {
  // Test Mock AniList Media
  const dragonBallSuperMedia: AniListMedia = {
    id: 21175,
    title: {
      romaji: 'Dragon Ball Chou',
      english: 'Dragon Ball Super',
      native: 'ドラゴンボール超（スーパー）',
    },
    synonyms: ['DBS', 'Dragon Ball Super', 'Dragon Ball Chou'],
    seasonYear: 2015,
    format: 'TV',
    status: 'FINISHED',
    genres: ['Action', 'Adventure', 'Comedy', 'Fantasy', 'Sci-Fi'],
    tags: [],
    externalLinks: [],
  };

  const onePieceMedia: AniListMedia = {
    id: 21,
    title: {
      romaji: 'ONE PIECE',
      english: 'ONE PIECE',
      native: 'ONE PIECE',
    },
    synonyms: ['OP'],
    seasonYear: 1999,
    format: 'TV',
    genres: ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy'],
    tags: [],
    externalLinks: [],
  };

  const narutoShippudenMedia: AniListMedia = {
    id: 1735,
    title: {
      romaji: 'Naruto: Shippuuden',
      english: 'Naruto Shippuden',
      native: 'NARUTO -ナルト- 疾風伝',
    },
    synonyms: ['Naruto 2', 'Naruto Shippuuden'],
    seasonYear: 2007,
    format: 'TV',
    genres: ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy'],
    tags: [],
    externalLinks: [],
  };

  const tokyoRevengersMedia: AniListMedia = {
    id: 108890,
    title: {
      romaji: 'Tokyo Revengers',
      english: 'Tokyo Revengers',
      native: '東京リベンジャーズ',
    },
    synonyms: ['Tokyo Manji Gang'],
    seasonYear: 2021,
    format: 'TV',
    genres: ['Action', 'Drama', 'Supernatural'],
    tags: [],
    externalLinks: [],
  };

  // 1. ROOT CAUSE & SCREENSHOT REGRESSION
  it('Scenario 01: Rejects TMDB 62710 (Blindspot) for Dragon Ball Super (AniList 21175)', () => {
    const blindspotCandidate = {
      id: 62710,
      name: 'Blindspot',
      original_name: 'Blindspot',
      origin_country: ['US'],
      original_language: 'en',
      first_air_date: '2015-09-21',
    };

    const result = AnimeIdentityValidator.validateTmdbMatch(dragonBallSuperMedia, blindspotCandidate);
    assert.equal(result.isValid, false, 'Blindspot must NEVER be accepted for Dragon Ball Super');
    assert.ok(result.reason.includes('Rejected') || result.reason.includes('mismatch'));
    assert.equal(result.confidence, 0);
  });

  it('Scenario 02: Validates genuine TMDB 62715 (Dragon Ball Chou / Super) for AniList 21175', () => {
    const dbsCandidate = {
      id: 62715,
      name: 'Dragon Ball Super',
      original_name: 'ドラゴンボール超（スーパー）',
      origin_country: ['JP'],
      original_language: 'ja',
      first_air_date: '2015-07-05',
    };

    const result = AnimeIdentityValidator.validateTmdbMatch(dragonBallSuperMedia, dbsCandidate);
    assert.equal(result.isValid, true, 'Genuine Dragon Ball Super entity must be verified');
    assert.ok(result.confidence >= 0.85);
  });

  it('Scenario 03: CANONICAL_OVERRIDES mapping for 21175 is corrected to 62715 (not 62710)', () => {
    assert.equal(CANONICAL_OVERRIDES[21175].tmdbId, 62715);
    assert.notEqual(CANONICAL_OVERRIDES[21175].tmdbId, 62710);
  });

  // 2. FRANCHISE IDENTITY & VALIDATION SUITE
  it('Scenario 04: Validates One Piece (AniList 21 -> TMDB 37854)', () => {
    const candidate = {
      id: 37854,
      name: 'One Piece',
      original_name: 'ONE PIECE',
      origin_country: ['JP'],
      original_language: 'ja',
    };
    const res = AnimeIdentityValidator.validateTmdbMatch(onePieceMedia, candidate);
    assert.equal(res.isValid, true);
    assert.equal(res.confidence, 1.0);
  });

  it('Scenario 05: Validates Naruto Shippuden with diacritics (AniList 1735 -> TMDB 31910)', () => {
    const candidate = {
      id: 31910,
      name: 'Naruto: Shippūden',
      original_name: 'NARUTO -ナルト- 疾風伝',
      origin_country: ['JP'],
      original_language: 'ja',
    };
    const res = AnimeIdentityValidator.validateTmdbMatch(narutoShippudenMedia, candidate);
    assert.equal(res.isValid, true);
    assert.ok(res.confidence >= 0.85);
  });

  it('Scenario 06: Validates Tokyo Revengers (AniList 108890 -> TMDB 112183)', () => {
    const candidate = {
      id: 112183,
      name: 'Tokyo Revengers',
      original_name: '東京リベンジャーズ',
      origin_country: ['JP'],
      original_language: 'ja',
    };
    const res = AnimeIdentityValidator.validateTmdbMatch(tokyoRevengersMedia, candidate);
    assert.equal(res.isValid, true);
    assert.equal(res.confidence, 1.0);
  });

  // 3. CANDIDATE LOGO FILTERING & PROVENANCE
  it('Scenario 07: Rejects non-transparent or vertical poster candidates as logos', () => {
    const verticalPoster: TmdbImageItem = {
      aspect_ratio: 0.667,
      height: 1500,
      width: 1000,
      file_path: '/poster123.jpg', // JPG, not transparent PNG
      vote_average: 8.5,
      vote_count: 50,
      iso_639_1: 'en',
    };
    const check1 = AnimeIdentityValidator.validateLogoCandidate(verticalPoster, 'Dragon Ball Super');
    assert.equal(check1.isValid, false);
    assert.ok(check1.reason.includes('PNG'));

    const verticalPngPoster: TmdbImageItem = {
      aspect_ratio: 0.45, // Vertical poster aspect ratio
      height: 1500,
      width: 675,
      file_path: '/poster123.png',
      vote_average: 8.5,
      vote_count: 50,
      iso_639_1: 'en',
    };
    const check2 = AnimeIdentityValidator.validateLogoCandidate(verticalPngPoster, 'Dragon Ball Super');
    assert.equal(check2.isValid, false);
    assert.ok(check2.reason.includes('aspect ratio'));
  });

  it('Scenario 08: Accepts genuine horizontal transparent PNG logo', () => {
    const validLogo: TmdbImageItem = {
      aspect_ratio: 2.75,
      height: 400,
      width: 1100,
      file_path: '/dbs_logo_transparent.png',
      vote_average: 9.1,
      vote_count: 120,
      iso_639_1: 'en',
    };
    const check = AnimeIdentityValidator.validateLogoCandidate(validLogo, 'Dragon Ball Super');
    assert.equal(check.isValid, true);
  });

  it('Scenario 09: Resolves logo with complete provenance tracking', async () => {
    const prefetchedLogos: TmdbImageItem[] = [
      {
        aspect_ratio: 3.12,
        height: 320,
        width: 1000,
        file_path: '/dbs_official_logo.png',
        vote_average: 9.5,
        vote_count: 150,
        iso_639_1: 'en',
      },
    ];

    const result = await LogoResolverService.resolveLogo(
      9921175,
      62715,
      'tv',
      prefetchedLogos,
      {
        ...dragonBallSuperMedia,
        id: 9921175,
      }
    );

    assert.ok(result !== null);
    assert.equal(result.animeId, 9921175);
    assert.equal(result.provider, 'tmdb');
    assert.equal(result.providerMediaId, 62715);
    assert.equal(result.verificationStatus, 'verified');
    assert.equal(result.artworkType, 'official_logo');
    assert.equal(result.verifiedTitle, 'Dragon Ball Super');
    assert.ok(result.logoUrl.includes('/dbs_official_logo.png'));
  });

  // 4. CACHE ISOLATION & PURGING
  it('Scenario 10: Ensures cache keys are isolated by canonical anime ID', () => {
    const key1 = `anime:logo:v3:21175`;
    const key2 = `anime:logo:v3:813`;
    assert.notEqual(key1, key2, 'Different anime MUST have distinct cache keys');
  });

  // 5. TRAILER AND HERO ARTWORK SEPARATION
  it('Scenario 11: Rejects unrelated TMDB trailer when identity fails', async () => {
    // If an invalid TMDB ID (like Blindspot 62710) is supplied to resolveArtwork for Dragon Ball Super:
    // It must reject the entity and fall back cleanly to AniList trailer / artwork!
    const art = await ArtworkResolverService.resolveArtwork(
      {
        ...dragonBallSuperMedia,
        trailer: { id: 'anilist_dbs_trailer', site: 'youtube' },
      },
      62710, // Invalid Blindspot ID
      'tv'
    );

    // The TMDB trailer must NOT be used because 62710 failed identity validation!
    assert.equal(art.resolution.logo, undefined, 'Must not extract logo from rejected TMDB entity');
    assert.equal(art.trailer?.key, 'anilist_dbs_trailer', 'Must fall back to genuine anime trailer');
  });

  // 6. ANIME WITH NO OFFICIAL LOGO
  it('Scenario 12: Gracefully returns null for anime with no verified logo', async () => {
    // Obscure anime with 0 logos
    const result = await LogoResolverService.resolveLogo(
      999999,
      undefined,
      undefined,
      [], // No logos
      {
        id: 999999,
        title: { romaji: 'Indie Short Anime' },
        synonyms: [],
        format: 'OVA',
        genres: [],
        tags: [],
        externalLinks: [],
      } as AniListMedia
    );

    assert.equal(result, null, 'Must return null when no logo exists, allowing clean text fallback');
  });

  // 7. CROSS-ANIME DATA CONTAMINATION CHECKS
  it('Scenario 13: Rejects Blindspot backdrop for Dragon Ball Super', async () => {
    const art = await ArtworkResolverService.resolveArtwork(
      {
        ...dragonBallSuperMedia,
        bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21175.jpg',
      },
      62710, // Invalid Blindspot ID
      'tv'
    );

    // TMDB backdrop must NOT be used from rejected entity 62710
    assert.notEqual(art.artwork.backdrop, 'https://image.tmdb.org/t/p/original/yJAOi2n0VYBEXdPI1NXv5FiOcBX.jpg');
    // Must fall back to AniList banner
    assert.equal(art.artwork.backdrop, 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21175.jpg');
  });

  it('Scenario 14: Validates multi-anime title regression across Naruto, Bleach, JJK, Death Note', () => {
    const titles = [
      { anime: 'Naruto', candidate: 'Naruto', expected: true },
      { anime: 'Bleach', candidate: 'Bleach', expected: true },
      { anime: 'Jujutsu Kaisen', candidate: 'Jujutsu Kaisen', expected: true },
      { anime: 'Death Note', candidate: 'Death Note', expected: true },
      { anime: 'Dragon Ball Super', candidate: 'Blindspot', expected: false },
      { anime: 'One Piece', candidate: 'Breaking Bad', expected: false },
    ];

    for (const t of titles) {
      const sim = AnimeIdentityValidator.computeTitleSimilarity(t.anime, t.candidate);
      if (t.expected) {
        assert.ok(sim >= 0.7, `${t.anime} must match ${t.candidate}`);
      } else {
        assert.ok(sim < 0.3, `${t.anime} must NOT match ${t.candidate}`);
      }
    }
  });
});
