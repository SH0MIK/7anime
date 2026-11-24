import { AniListMedia } from '../providers/anilist.provider.js';
import {
  TmdbTvDetails,
  TmdbMovieDetails,
  TmdbTvSearchResult,
  TmdbMovieSearchResult,
  TmdbImageItem,
} from '../providers/tmdb.provider.js';

export interface IdentityValidationResult {
  isValid: boolean;
  confidence: number;
  reason: string;
  candidateTitle?: string;
  matchedTitle?: string;
}

export class AnimeIdentityValidator {
  /**
   * Normalizes a string by stripping punctuation, extra spaces, and diacritics.
   * e.g. "Shippūden" -> "shippuden", "Chō" -> "chou", "Dragon Ball Super: Broly" -> "dragon ball super broly"
   */
  public static normalize(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Tokenizes a title into significant semantic words, excluding common grammatical particles.
   */
  public static getTokens(str: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'for', 'with', 'by',
      'no', 'wa', 'ga', 'wo', 'ni', 'de', 'e', 'to', 'kara', 'made'
    ]);
    return this.normalize(str)
      .split(' ')
      .filter((t) => t.length > 0 && !stopWords.has(t));
  }

  /**
   * Calculates similarity score [0, 1] between an anime title and a candidate title.
   */
  public static computeTitleSimilarity(animeTitle: string, candidateTitle: string): number {
    const normA = this.normalize(animeTitle);
    const normB = this.normalize(candidateTitle);

    if (!normA || !normB) return 0;
    if (normA === normB) return 1.0;

    // Substring / containment check
    if (normA.includes(normB) || normB.includes(normA)) {
      const minLen = Math.min(normA.length, normB.length);
      const maxLen = Math.max(normA.length, normB.length);
      const containment = minLen / maxLen;
      if (containment >= 0.4) {
        return Math.max(0.85, containment);
      }
    }

    const tokensA = this.getTokens(animeTitle);
    const tokensB = this.getTokens(candidateTitle);

    if (tokensA.length === 0 || tokensB.length === 0) return 0;

    const setB = new Set(tokensB);
    let intersection = 0;
    for (const t of tokensA) {
      if (setB.has(t)) intersection++;
    }

    const coverageA = intersection / tokensA.length;
    const coverageB = intersection / tokensB.length;
    const maxCoverage = Math.max(coverageA, coverageB);

    const union = new Set([...tokensA, ...tokensB]).size;
    const jaccard = union > 0 ? intersection / union : 0;

    return Math.max(jaccard, maxCoverage * 0.9);
  }

  /**
   * Validates if a TMDB entity (TV/Movie) matches an AniList anime media record.
   * Cross-checks titles (english, romaji, native, synonyms), origin country, and language.
   */
  public static validateTmdbMatch(
    anime: AniListMedia,
    candidate: {
      id: number;
      name?: string;
      title?: string;
      original_name?: string;
      original_title?: string;
      origin_country?: string[];
      original_language?: string;
      first_air_date?: string;
      release_date?: string;
    }
  ): IdentityValidationResult {
    const candidateName = candidate.name || candidate.title || '';
    const candidateOrigName = candidate.original_name || candidate.original_title || '';

    if (!candidateName && !candidateOrigName) {
      return {
        isValid: false,
        confidence: 0,
        reason: 'Candidate entity has no name or title.',
      };
    }

    // Collect all genuine titles from AniList anime
    const animeTitles: string[] = [
      anime.title?.english,
      anime.title?.romaji,
      anime.title?.native,
      ...(anime.synonyms || []),
    ].filter((t): t is string => Boolean(t && t.trim().length > 0));

    const candidateTitles = [candidateName, candidateOrigName].filter(Boolean);

    let maxScore = 0;
    let bestMatchedTitle = animeTitles[0] || 'Unknown';
    let bestCandidateTitle = candidateTitles[0] || 'Unknown';

    for (const at of animeTitles) {
      for (const ct of candidateTitles) {
        const score = this.computeTitleSimilarity(at, ct);
        if (score > maxScore) {
          maxScore = score;
          bestMatchedTitle = at;
          bestCandidateTitle = ct;
        }
      }
    }

    // Strict non-anime western production disqualification:
    // If candidate has western origin country (e.g. US, GB, CA, FR) and non-Japanese language,
    // and similarity is below 0.85, REJECT immediately!
    const nonAnimeOrigins = new Set(['US', 'GB', 'CA', 'FR', 'DE', 'AU', 'IT', 'ES', 'BR', 'MX']);
    const hasNonAnimeOrigin = candidate.origin_country?.some((c) => nonAnimeOrigins.has(c.toUpperCase()));
    const isNonJapanese = candidate.original_language && candidate.original_language.toLowerCase() !== 'ja';

    if (hasNonAnimeOrigin && isNonJapanese && maxScore < 0.85) {
      return {
        isValid: false,
        confidence: maxScore,
        reason: `Rejected non-anime western production (Origin: ${candidate.origin_country?.join(',')}, Lang: ${candidate.original_language}, Candidate: "${bestCandidateTitle}" vs Anime: "${bestMatchedTitle}", score: ${maxScore.toFixed(2)})`,
        candidateTitle: bestCandidateTitle,
        matchedTitle: bestMatchedTitle,
      };
    }

    // General threshold: minimum 0.50 title similarity required
    if (maxScore < 0.50) {
      return {
        isValid: false,
        confidence: maxScore,
        reason: `Title mismatch: "${bestCandidateTitle}" does not match anime "${bestMatchedTitle}" (score: ${maxScore.toFixed(2)})`,
        candidateTitle: bestCandidateTitle,
        matchedTitle: bestMatchedTitle,
      };
    }

    return {
      isValid: true,
      confidence: Number(maxScore.toFixed(2)),
      reason: `Verified identity: "${bestCandidateTitle}" matches "${bestMatchedTitle}" (confidence: ${maxScore.toFixed(2)})`,
      candidateTitle: bestCandidateTitle,
      matchedTitle: bestMatchedTitle,
    };
  }

  /**
   * Validates a candidate logo item from TMDB images.
   * Ensures genuine transparent PNG, valid aspect ratio, and proper dimensions.
   */
  public static validateLogoCandidate(
    logo: TmdbImageItem,
    animeTitle: string
  ): { isValid: boolean; reason: string } {
    if (!logo || typeof logo !== 'object') {
      return { isValid: false, reason: 'Invalid logo object' };
    }

    if (!logo.file_path || typeof logo.file_path !== 'string') {
      return { isValid: false, reason: 'Missing file path' };
    }

    // Must be transparent PNG
    if (!logo.file_path.startsWith('/') || !logo.file_path.toLowerCase().endsWith('.png')) {
      return { isValid: false, reason: 'Candidate logo is not a PNG file' };
    }

    // Dimension checks: logo must have positive dimensions
    if (typeof logo.width !== 'number' || logo.width < 100) {
      return { isValid: false, reason: `Logo width too small (${logo.width}px)` };
    }
    if (typeof logo.height !== 'number' || logo.height < 30) {
      return { isValid: false, reason: `Logo height too small (${logo.height}px)` };
    }

    // Aspect ratio: Logos are horizontal or balanced (never tall vertical posters)
    if (typeof logo.aspect_ratio !== 'number' || logo.aspect_ratio < 0.5 || logo.aspect_ratio > 8.5) {
      return { isValid: false, reason: `Invalid logo aspect ratio (${logo.aspect_ratio})` };
    }

    return { isValid: true, reason: 'Valid transparent PNG logo candidate' };
  }
}
