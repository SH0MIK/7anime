/**
 * Centralized AniList GraphQL Query Definitions
 */

export const MEDIA_CARD_FRAGMENT = `
  id
  idMal
  title {
    romaji
    english
    native
  }
  synonyms
  description(asHtml: false)
  format
  status
  season
  seasonYear
  episodes
  duration
  coverImage {
    extraLarge
    large
    medium
    color
  }
  bannerImage
  genres
  averageScore
  meanScore
  popularity
  trending
  favourites
  studios(isMain: true) {
    nodes {
      id
      name
      isAnimationStudio
    }
  }
  nextAiringEpisode {
    id
    airingAt
    timeUntilAiring
    episode
  }
  trailer {
    id
    site
    thumbnail
  }
`;

export const FULL_MEDIA_FRAGMENT = `
  ${MEDIA_CARD_FRAGMENT}
  source
  countryOfOrigin
  hashtag
  startDate {
    year
    month
    day
  }
  endDate {
    year
    month
    day
  }
  tags {
    id
    name
    description
    category
    rank
    isMediaSpoiler
  }
  relations {
    edges {
      id
      relationType
      node {
        id
        format
        status
        title {
          romaji
          english
        }
        coverImage {
          large
          medium
          color
        }
        bannerImage
        averageScore
        episodes
      }
    }
  }
  recommendations(sort: [RATING_DESC], perPage: 10) {
    nodes {
      id
      rating
      mediaRecommendation {
        id
        format
        status
        title {
          romaji
          english
        }
        coverImage {
          large
          medium
          color
        }
        bannerImage
        averageScore
        episodes
      }
    }
  }
  characters(sort: [ROLE, RELEVANCE], perPage: 12) {
    edges {
      role
      node {
        id
        name {
          full
          native
        }
        image {
          medium
        }
      }
    }
  }
`;

/**
 * Batched query for Homepage sections to minimize round-trips.
 */
export const HOMEPAGE_SECTIONS_QUERY = `
  query GetHomepageSections($season: MediaSeason, $seasonYear: Int) {
    spotlight: Page(page: 1, perPage: 10) {
      media(type: ANIME, sort: [TRENDING_DESC, POPULARITY_DESC]) {
        ${MEDIA_CARD_FRAGMENT}
      }
    }
    trending: Page(page: 1, perPage: 18) {
      media(type: ANIME, sort: [TRENDING_DESC]) {
        ${MEDIA_CARD_FRAGMENT}
      }
    }
    popular: Page(page: 1, perPage: 18) {
      media(type: ANIME, sort: [POPULARITY_DESC]) {
        ${MEDIA_CARD_FRAGMENT}
      }
    }
    airing: Page(page: 1, perPage: 18) {
      media(type: ANIME, status: RELEASING, sort: [POPULARITY_DESC]) {
        ${MEDIA_CARD_FRAGMENT}
      }
    }
    topRated: Page(page: 1, perPage: 18) {
      media(type: ANIME, sort: [SCORE_DESC]) {
        ${MEDIA_CARD_FRAGMENT}
      }
    }
    seasonal: Page(page: 1, perPage: 18) {
      media(type: ANIME, season: $season, seasonYear: $seasonYear, sort: [POPULARITY_DESC]) {
        ${MEDIA_CARD_FRAGMENT}
      }
    }
    movies: Page(page: 1, perPage: 18) {
      media(type: ANIME, format: MOVIE, sort: [POPULARITY_DESC]) {
        ${MEDIA_CARD_FRAGMENT}
      }
    }
    upcoming: Page(page: 1, perPage: 18) {
      media(type: ANIME, status: NOT_YET_RELEASED, sort: [POPULARITY_DESC]) {
        ${MEDIA_CARD_FRAGMENT}
      }
    }
  }
`;

/**
 * Single anime full details query.
 */
export const ANIME_DETAILS_QUERY = `
  query GetAnimeDetails($id: Int) {
    Media(id: $id, type: ANIME) {
      ${FULL_MEDIA_FRAGMENT}
    }
  }
`;

/**
 * Resolves AniList ID from a MyAnimeList ID.
 */
export const ANIME_BY_MAL_ID_QUERY = `
  query GetAnimeIdByMalId($malId: Int) {
    Media(idMal: $malId, type: ANIME) {
      id
      idMal
    }
  }
`;

/**
 * Browse & Search anime query with full filtering and pagination.
 */
export const BROWSE_ANIME_QUERY = `
  query BrowseAnime(
    $page: Int
    $perPage: Int
    $search: String
    $id_in: [Int]
    $genre_in: [String]
    $tag_in: [String]
    $format: MediaFormat
    $format_in: [MediaFormat]
    $status: MediaStatus
    $status_in: [MediaStatus]
    $season: MediaSeason
    $seasonYear: Int
    $averageScore_greater: Int
    $episodes_greater: Int
    $countryOfOrigin: CountryCode
    $sort: [MediaSort]
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        total
        perPage
        currentPage
        lastPage
        hasNextPage
      }
      media(
        type: ANIME
        search: $search
        id_in: $id_in
        genre_in: $genre_in
        tag_in: $tag_in
        format: $format
        format_in: $format_in
        status: $status
        status_in: $status_in
        season: $season
        seasonYear: $seasonYear
        averageScore_greater: $averageScore_greater
        episodes_greater: $episodes_greater
        countryOfOrigin: $countryOfOrigin
        sort: $sort
        isAdult: false
      ) {
        ${MEDIA_CARD_FRAGMENT}
      }
    }
  }
`;

/**
 * Verified production studio media query.
 */
export const STUDIO_MEDIA_QUERY = `
  query GetStudioMedia($studio: String) {
    Studio(search: $studio) {
      id
      name
      media(perPage: 100, isMain: true, sort: POPULARITY_DESC) {
        nodes {
          id
        }
      }
    }
  }
`;

/**
 * Weekly airing schedule query with unified media fragment.
 */
export const WEEKLY_AIRING_SCHEDULE_QUERY = `
  query GetWeeklyAiringSchedule($start: Int, $end: Int, $page: Int = 1, $perPage: Int = 50) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        total
        currentPage
        lastPage
        hasNextPage
      }
      airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: [TIME]) {
        id
        airingAt
        timeUntilAiring
        episode
        media {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
    }
  }
`;

/**
 * Fast search query for search modal autocomplete.
 */
export const SEARCH_PREVIEW_QUERY = `
  query SearchPreview($search: String, $perPage: Int = 8) {
    Page(page: 1, perPage: $perPage) {
      media(type: ANIME, search: $search, sort: [POPULARITY_DESC, SCORE_DESC]) {
        ${MEDIA_CARD_FRAGMENT}
      }
    }
  }
`;
