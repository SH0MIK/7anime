import { AniListMedia } from '../providers/anilist.provider.js';
import {
  TmdbProvider,
  TmdbTvSearchResult,
  TmdbMovieSearchResult,
} from '../providers/tmdb.provider.js';

export interface AnimeMatchResult {
  tmdbId: number;
  mediaType: 'tv' | 'movie';
  confidence: number;
  matchMethod: 'canonical_override' | 'exact_title' | 'title_and_year';
}

/**
 * Verified canonical baseline mappings for major anime franchises to prevent
 * false matches between sequels, movies, and seasons.
 */
export const CANONICAL_OVERRIDES: Record<number, { tmdbId: number; mediaType: 'tv' | 'movie' }> = {
  // Massive TV series
  21: { tmdbId: 37854, mediaType: 'tv' }, // One Piece
  20: { tmdbId: 46260, mediaType: 'tv' }, // Naruto
  1735: { tmdbId: 31910, mediaType: 'tv' }, // Naruto Shippuden
  223: { tmdbId: 12609, mediaType: 'tv' }, // Dragon Ball
  813: { tmdbId: 12971, mediaType: 'tv' }, // Dragon Ball Z
  21175: { tmdbId: 62715, mediaType: 'tv' }, // Dragon Ball Super (TMDB 62715 = Dragon Ball Chou / Super)
  269: { tmdbId: 30984, mediaType: 'tv' }, // Bleach
  116674: { tmdbId: 30984, mediaType: 'tv' }, // Bleach: Thousand-Year Blood War
  114446: { tmdbId: 30984, mediaType: 'tv' }, // Bleach: TYBW Alternate ID
  16498: { tmdbId: 1429, mediaType: 'tv' }, // Attack on Titan
  20958: { tmdbId: 1429, mediaType: 'tv' }, // Attack on Titan Season 2
  99147: { tmdbId: 1429, mediaType: 'tv' }, // Attack on Titan Season 3
  110277: { tmdbId: 1429, mediaType: 'tv' }, // Attack on Titan Final Season
  11061: { tmdbId: 46298, mediaType: 'tv' }, // Hunter x Hunter (2011)
  101922: { tmdbId: 85937, mediaType: 'tv' }, // Demon Slayer: Kimetsu no Yaiba
  129874: { tmdbId: 85937, mediaType: 'tv' }, // Demon Slayer: Mugen Train Arc TV
  142329: { tmdbId: 85937, mediaType: 'tv' }, // Demon Slayer: Entertainment District
  145139: { tmdbId: 85937, mediaType: 'tv' }, // Demon Slayer: Swordsmith Village
  113415: { tmdbId: 95479, mediaType: 'tv' }, // Jujutsu Kaisen
  145064: { tmdbId: 95479, mediaType: 'tv' }, // Jujutsu Kaisen Season 2
  21459: { tmdbId: 65930, mediaType: 'tv' }, // My Hero Academia
  5114: { tmdbId: 31911, mediaType: 'tv' }, // Fullmetal Alchemist: Brotherhood
  1535: { tmdbId: 13916, mediaType: 'tv' }, // Death Note
  1: { tmdbId: 4087, mediaType: 'tv' }, // Cowboy Bebop
  151807: { tmdbId: 127532, mediaType: 'tv' }, // Solo Leveling
  117410: { tmdbId: 127532, mediaType: 'tv' }, // Solo Leveling Alt ID
  154587: { tmdbId: 209867, mediaType: 'tv' }, // Frieren: Beyond Journey's End
  127230: { tmdbId: 114410, mediaType: 'tv' }, // Chainsaw Man
  140960: { tmdbId: 120089, mediaType: 'tv' }, // Spy x Family
  97940: { tmdbId: 73223, mediaType: 'tv' }, // Black Clover
  20605: { tmdbId: 61374, mediaType: 'tv' }, // Tokyo Ghoul
  9253: { tmdbId: 39516, mediaType: 'tv' }, // Steins;Gate
  11757: { tmdbId: 45782, mediaType: 'tv' }, // Sword Art Online
  105333: { tmdbId: 80986, mediaType: 'tv' }, // Dr. STONE

  // Iconic Movies
  199: { tmdbId: 129, mediaType: 'movie' }, // Spirited Away
  21519: { tmdbId: 372058, mediaType: 'movie' }, // Your Name (Kimi no Na wa)
  20954: { tmdbId: 378064, mediaType: 'movie' }, // A Silent Voice (Koe no Katachi)
  164: { tmdbId: 128, mediaType: 'movie' }, // Princess Mononoke
  431: { tmdbId: 4935, mediaType: 'movie' }, // Howl's Moving Castle
  112151: { tmdbId: 635302, mediaType: 'movie' }, // Demon Slayer: Mugen Train Movie
  131573: { tmdbId: 810693, mediaType: 'movie' }, // Jujutsu Kaisen 0
  142770: { tmdbId: 916224, mediaType: 'movie' }, // Suzume
  145946: { tmdbId: 916224, mediaType: 'movie' }, // Suzume Alt ID
  106286: { tmdbId: 568160, mediaType: 'movie' }, // Weathering With You
  106240: { tmdbId: 604605, mediaType: 'movie' }, // Hello World
};

export class AnimeMatcherService {
  /**
   * Matches an AniList anime to its verified TMDB entity.
   */
  public static async match(anime: AniListMedia): Promise<AnimeMatchResult | null> {
    // 1. Check canonical override first (zero-latency, 100% precision)
    if (CANONICAL_OVERRIDES[anime.id]) {
      const override = CANONICAL_OVERRIDES[anime.id];
      return {
        tmdbId: override.tmdbId,
        mediaType: override.mediaType,
        confidence: 1.0,
        matchMethod: 'canonical_override',
      };
    }

    const isMovie = String(anime.format || '').toUpperCase() === 'MOVIE';
    const targetMediaType: 'tv' | 'movie' = isMovie ? 'movie' : 'tv';

    // 2. Gather candidate title variations
    const searchTitles: string[] = [];
    if (anime.title.english) searchTitles.push(anime.title.english);
    if (anime.title.romaji && !searchTitles.includes(anime.title.romaji)) {
      searchTitles.push(anime.title.romaji);
    }
    for (const syn of anime.synonyms || []) {
      if (syn && !searchTitles.includes(syn) && syn.length > 2) {
        searchTitles.push(syn);
      }
    }

    const year = anime.seasonYear;

    // 3. Search TMDB with top title candidates
    for (const title of searchTitles.slice(0, 3)) {
      if (targetMediaType === 'movie') {
        const results = await TmdbProvider.searchMovie(title, year);
        const match = this.findBestMovieMatch(anime, results);
        if (match) return match;
      } else {
        const results = await TmdbProvider.searchTv(title, year);
        const match = this.findBestTvMatch(anime, results);
        if (match) return match;
      }
    }

    // 4. Cross-format fallback (e.g. format listed as TV on AniList but indexed as Movie/OVA on TMDB)
    const fallbackMediaType: 'tv' | 'movie' = targetMediaType === 'movie' ? 'tv' : 'movie';
    for (const title of searchTitles.slice(0, 2)) {
      if (fallbackMediaType === 'movie') {
        const results = await TmdbProvider.searchMovie(title, year);
        const match = this.findBestMovieMatch(anime, results);
        if (match) return match;
      } else {
        const results = await TmdbProvider.searchTv(title, year);
        const match = this.findBestTvMatch(anime, results);
        if (match) return match;
      }
    }

    return null;
  }

  /**
   * Evaluates TV search results and calculates confidence score.
   */
  private static findBestTvMatch(
    anime: AniListMedia,
    results: TmdbTvSearchResult[]
  ): AnimeMatchResult | null {
    if (!results || results.length === 0) return null;

    let bestMatch: TmdbTvSearchResult | null = null;
    let highestScore = 0;

    for (const candidate of results) {
      const score = this.calculateTvScore(anime, candidate);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = candidate;
      }
    }

    // Strict threshold of 0.70 to prevent false matches
    if (bestMatch && highestScore >= 0.7) {
      return {
        tmdbId: bestMatch.id,
        mediaType: 'tv',
        confidence: Number(highestScore.toFixed(2)),
        matchMethod: highestScore >= 0.95 ? 'exact_title' : 'title_and_year',
      };
    }

    return null;
  }

  /**
   * Evaluates Movie search results and calculates confidence score.
   */
  private static findBestMovieMatch(
    anime: AniListMedia,
    results: TmdbMovieSearchResult[]
  ): AnimeMatchResult | null {
    if (!results || results.length === 0) return null;

    let bestMatch: TmdbMovieSearchResult | null = null;
    let highestScore = 0;

    for (const candidate of results) {
      const score = this.calculateMovieScore(anime, candidate);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = candidate;
      }
    }

    if (bestMatch && highestScore >= 0.7) {
      return {
        tmdbId: bestMatch.id,
        mediaType: 'movie',
        confidence: Number(highestScore.toFixed(2)),
        matchMethod: highestScore >= 0.95 ? 'exact_title' : 'title_and_year',
      };
    }

    return null;
  }

  /**
   * Normalizes a string for comparison.
   */
  private static normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculates similarity between 0 and 1 using Jaccard word token overlap.
   */
  private static stringSimilarity(strA: string, strB: string): number {
    const a = this.normalizeTitle(strA);
    const b = this.normalizeTitle(strB);

    if (a === b) return 1.0;
    if (!a || !b) return 0;

    const tokensA = new Set(a.split(' ').filter(Boolean));
    const tokensB = new Set(b.split(' ').filter(Boolean));

    let intersection = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) intersection++;
    }

    const union = new Set([...tokensA, ...tokensB]).size;
    return union > 0 ? intersection / union : 0;
  }

  private static calculateTvScore(anime: AniListMedia, candidate: TmdbTvSearchResult): number {
    let bestTitleSim = 0;
    const candidateTitles = [candidate.name, candidate.original_name].filter(Boolean);
    const animeTitles = [
      anime.title.english,
      anime.title.romaji,
      ...(anime.synonyms || []),
    ].filter(Boolean) as string[];

    for (const at of animeTitles) {
      for (const ct of candidateTitles) {
        const sim = this.stringSimilarity(at, ct);
        if (sim > bestTitleSim) bestTitleSim = sim;
      }
    }

    let score = bestTitleSim * 0.8;

    // Check year alignment
    if (anime.seasonYear && candidate.first_air_date) {
      const candidateYear = parseInt(candidate.first_air_date.slice(0, 4), 10);
      if (!isNaN(candidateYear)) {
        const yearDiff = Math.abs(anime.seasonYear - candidateYear);
        if (yearDiff === 0) {
          score += 0.2;
        } else if (yearDiff === 1) {
          score += 0.1;
        } else if (yearDiff > 4) {
          score -= 0.2;
        }
      }
    }

    return Math.min(Math.max(score, 0), 1.0);
  }

  private static calculateMovieScore(
    anime: AniListMedia,
    candidate: TmdbMovieSearchResult
  ): number {
    let bestTitleSim = 0;
    const candidateTitles = [candidate.title, candidate.original_title].filter(Boolean);
    const animeTitles = [
      anime.title.english,
      anime.title.romaji,
      ...(anime.synonyms || []),
    ].filter(Boolean) as string[];

    for (const at of animeTitles) {
      for (const ct of candidateTitles) {
        const sim = this.stringSimilarity(at, ct);
        if (sim > bestTitleSim) bestTitleSim = sim;
      }
    }

    let score = bestTitleSim * 0.8;

    if (anime.seasonYear && candidate.release_date) {
      const candidateYear = parseInt(candidate.release_date.slice(0, 4), 10);
      if (!isNaN(candidateYear)) {
        const yearDiff = Math.abs(anime.seasonYear - candidateYear);
        if (yearDiff === 0) {
          score += 0.2;
        } else if (yearDiff === 1) {
          score += 0.1;
        } else if (yearDiff > 4) {
          score -= 0.2;
        }
      }
    }

    return Math.min(Math.max(score, 0), 1.0);
  }
}
