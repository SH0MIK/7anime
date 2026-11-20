import type { AvatarDecorationId, BannerEffectId } from './cosmetics';

export type WatchStatus =
  | 'watching'
  | 'plan'
  | 'completed'
  | 'on_hold'
  | 'dropped';

export type AuthProvider =
  | 'google'
  | 'apple'
  | 'discord'
  | 'anilist'
  | 'myanimelist'
  | 'email';

export interface LibraryEntry {
  routeId: string;
  status: WatchStatus;
  progress: number;
  rating?: number | null;
  updatedAt: number;
  folderIds?: string[];
}

export interface CustomFolder {
  id: string;
  name: string;
  itemIds: string[];
  createdAt: number;
}

export interface WatchHistoryEntry {
  routeId: string;
  episode: number;
  positionSec: number;
  durationSec: number;
  audioMode: 'sub' | 'dub';
  updatedAt: number;
}

export interface ProfileVisibility {
  publicProfile: boolean;
  showComments: boolean;
  showLibrary: boolean;
  showSocial: boolean;
}

export interface UserProfile {
  id: string;
  username: string;
  handle: string;
  avatar: string | null;
  /** Optional uploaded profile banner (data URL or URL). */
  banner?: string | null;
  bannerUrl?: string | null;
  accentColor: string;
  bannerEffect: BannerEffectId;
  frameStyle: 'none' | 'crown' | 'celestial' | 'crimson' | 'neon' | AvatarDecorationId;
  avatarDecoration?: AvatarDecorationId;
  bio: string;
  level: number;
  xp: number;
  nextLevelXp: number;
  isVip: boolean;
  provider: AuthProvider;
  joinedAt: string;
  /** Optional glow colour applied to the username (hex). null/undefined = none. */
  usernameGlow?: string | null;
  /** Optional profile visibility switches. Missing = all visible. */
  visibility?: ProfileVisibility;
}
