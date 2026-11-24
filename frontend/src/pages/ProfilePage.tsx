import React, { useState, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Award, Camera, Clock, Edit3, Share2, Sparkles } from 'lucide-react';
import { useApp } from '@/src/context/AppContext';
import { findAnimeByParam } from '@/src/data/catalogService';
import { AvatarBadge } from '@/src/components/BrandMark';
import { AnimeCard } from '@/src/components/AnimeCard';
import { ProfileStyleModal } from '@/src/components/profile/ProfileStyleModal';
import { BannerEffectRenderer } from '@/src/components/profile/BannerEffectRenderer';
import { AVATAR_DECORATIONS, BANNER_EFFECTS } from '@/src/data/cosmeticsCatalog';
import { glowStyle } from '@/src/components/AccountSection';
import { apiClient } from '@/src/services/apiClient';
import type { UserProfile } from '@/src/types/user';
import type { AvatarDecorationId, BannerEffectId } from '@/src/types/cosmetics';

export const ProfilePage: React.FC = () => {
  const { username: routeUser } = useParams<{ username?: string }>();
  const { user, setAuthOpen, updateUserProfile, library, watchTimeMinutes, showToast } = useApp();

  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  if (!user && !routeUser) {
    return (
      <div className="page-shell" style={{ maxWidth: 640, textAlign: 'center', paddingTop: 120 }}>
        <h1 className="page-title" style={{ marginBottom: 10 }}>Sign in to view your profile</h1>
        <p style={{ color: 'rgb(var(--c-text2))', marginBottom: 24 }}>
          Unlock XP levels, animated banner effects, avatar frames, and synced watchlists.
        </p>
        <button
          type="button"
          className="watch-pill"
          aria-pressed="true"
          style={{ height: 42, padding: '0 24px', fontSize: 14 }}
          onClick={() => setAuthOpen(true)}
        >
          Sign in to 7Anime
        </button>
      </div>
    );
  }

  const profile: UserProfile = routeUser && routeUser !== user?.username
    ? {
        id: 'public',
        username: routeUser,
        handle: `@${routeUser.toLowerCase()}`,
        avatar: null,
        accentColor: '#8ac4ff',
        avatarDecoration: 'none',
        bannerEffect: 'none',
        bannerUrl: null,
        banner: null,
        frameStyle: 'none',
        bio: '7Anime member.',
        level: 0,
        xp: 0,
        nextLevelXp: 75,
        isVip: false,
        provider: 'email',
        joinedAt: '2026',
      }
    : (user as UserProfile);

  const isOwn = !routeUser || routeUser === user?.username;
  const activeBanner = profile.bannerUrl || profile.banner;
  const isPrivate = !isOwn && profile.visibility?.publicProfile === false;
  const canShowLibrary = isOwn || profile.visibility?.showLibrary !== false;

  const savedAnimes = Object.values(library.entries)
    .map((e) => findAnimeByParam(e.routeId))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  const handleCopyLink = () => {
    try {
      navigator.clipboard.writeText(window.location.href);
      showToast('Profile link copied to clipboard!');
    } catch {
      showToast('Failed to copy link', 'error');
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file', 'error');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      showToast('Photo must be 50 MB or smaller', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      const result = loadEvt.target?.result as string;
      if (result) {
        updateUserProfile({ avatar: result });
        if (apiClient.isAuthenticated()) {
          apiClient.updateProfile({ avatarUrl: result }).catch(() => {});
        }
        showToast('Profile photo updated!');
      }
    };
    reader.onerror = () => showToast('Failed to read image file', 'error');
    reader.readAsDataURL(file);
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Size limit: 5MB
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      showToast('Banner file size exceeds 5MB limit', 'error');
      if (bannerInputRef.current) bannerInputRef.current.value = '';
      return;
    }

    const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
    const isWebP = file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp');

    // Animated banners check (requires Level 2 or VIP as per ANI.PM rules)
    if (isGif || isWebP) {
      const userLevel = profile.level ?? 0;
      if (userLevel < 2 && !profile.isVip) {
        showToast('Animated banners unlock at Level 2 (or VIP membership)', 'info');
      }
    }

    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      const result = loadEvt.target?.result as string;
      if (result) {
        updateUserProfile({ bannerUrl: result, banner: result });
        if (apiClient.isAuthenticated()) {
          apiClient.updateProfile({ bannerUrl: result }).catch(() => {});
        }
        showToast('Banner updated successfully!');
      }
    };
    reader.onerror = () => {
      showToast('Failed to read image file', 'error');
    };
    reader.readAsDataURL(file);
    if (bannerInputRef.current) bannerInputRef.current.value = '';
  };

  const activeDecoObj = AVATAR_DECORATIONS.find((d) => d.id === profile.avatarDecoration);
  const activeBfxObj = BANNER_EFFECTS.find((b) => b.id === profile.bannerEffect);

  if (isPrivate) {
    return (
      <div className="page-shell" style={{ maxWidth: 640, textAlign: 'center', paddingTop: 120 }}>
        <h1 className="page-title" style={{ marginBottom: 10 }}>This profile is private</h1>
        <p style={{ color: 'rgb(var(--c-text2))', marginBottom: 24 }}>
          {profile.username} has set their profile visibility to private.
        </p>
        <Link to="/" className="watch-pill">Back to home</Link>
      </div>
    );
  }

  return (
    <div className="page-shell">
      {/* Banner Header with Animated Particle Effects */}
      <div
        className="settings-card"
        style={{
          position: 'relative',
          overflow: 'hidden',
          padding: '32px 28px',
          background: activeBanner
            ? `url(${activeBanner}) center/cover no-repeat`
            : `linear-gradient(135deg, ${profile.accentColor}28, rgba(20,21,28,0.92))`,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 16,
          marginBottom: 24,
        }}
      >
        {/* Banner Effect Particle Layer */}
        {profile.bannerEffect && profile.bannerEffect !== 'none' && (
          <BannerEffectRenderer effect={profile.bannerEffect} />
        )}

        {/* Change / Add Banner Button on Banner Top-Right */}
        {isOwn && (
          <>
            <button
              type="button"
              onClick={() => bannerInputRef.current?.click()}
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                zIndex: 5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 999,
                background: 'rgba(15, 17, 23, 0.8)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Camera size={13} />
              <span>{activeBanner ? 'Change banner' : 'Add banner'}</span>
            </button>
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={handleBannerUpload}
            />
          </>
        )}

        {/* User Info Bar */}
        <div style={{ position: 'relative', zIndex: 3, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20 }}>
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <AvatarBadge
              username={profile.username}
              avatar={profile.avatar}
              color={profile.accentColor}
              size={84}
              decoration={profile.avatarDecoration}
              frameStyle={profile.frameStyle}
            />
            {isOwn && (
              <>
                <button
                  type="button"
                  className="pf-avatar-lg__cam"
                  aria-label="Change photo"
                  onClick={() => photoInputRef.current?.click()}
                  style={{
                    position: 'absolute',
                    bottom: 2,
                    right: 2,
                    zIndex: 6,
                    cursor: 'pointer',
                  }}
                >
                  <Camera size={13} aria-hidden="true" />
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handlePhotoUpload}
                />
              </>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, ...glowStyle(profile.usernameGlow) }}>
                {profile.username}
              </h1>
              {profile.isVip && (
                <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: 'rgba(138,196,255,0.2)', color: '#9fd0ff' }}>
                  VIP
                </span>
              )}
            </div>
            <div style={{ fontSize: 13.5, color: 'rgb(var(--c-text2))', marginTop: 2 }}>
              {profile.handle} · Joined {profile.joinedAt}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 14, maxWidth: 520 }}>{profile.bio}</p>

            {/* Profile Action Buttons */}
            {isOwn && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                <Link
                  to="/settings#pf-profile"
                  className="watch-pill"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', fontSize: 12.5 }}
                >
                  <Edit3 size={13} />
                  <span>Edit profile</span>
                </Link>
                <button
                  type="button"
                  className="watch-pill"
                  onClick={() => setIsStyleModalOpen(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', fontSize: 12.5 }}
                >
                  <Sparkles size={13} />
                  <span>Profile style</span>
                </button>
                <button
                  type="button"
                  className="watch-pill"
                  onClick={handleCopyLink}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', fontSize: 12.5 }}
                >
                  <Share2 size={13} />
                  <span>Copy link</span>
                </button>
              </div>
            )}
          </div>

          <div style={{ minWidth: 210 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 650, marginBottom: 6 }}>
              <span>Level {profile.level}</span>
              <span>{profile.xp.toLocaleString()} / {profile.nextLevelXp.toLocaleString()} XP</span>
            </div>
            <div className="yt-pmenu__level-track" style={{ height: 7 }}>
              <span
                className="yt-pmenu__level-fill"
                style={{ width: `${Math.min(100, (profile.xp / profile.nextLevelXp) * 100)}%` }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, fontSize: 12, color: 'rgb(var(--c-text2))' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Clock size={13} /> {Math.floor(watchTimeMinutes / 60)}h watched
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Award size={13} /> 4 badges
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Style Management Card for Own Profile */}
      {isOwn && (
        <div
          className="settings-card"
          style={{
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
            padding: '16px 20px',
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Sparkles size={15} color="#8ac4ff" /> Active Profile Style
            </div>
            <div style={{ fontSize: 12.5, color: 'rgb(var(--c-text2))' }}>
              Avatar Decoration: <strong style={{ color: '#ffffff' }}>{activeDecoObj?.name || 'None'}</strong> · Banner Effect: <strong style={{ color: '#ffffff' }}>{activeBfxObj?.name || 'None'}</strong>
            </div>
          </div>
          <button
            type="button"
            className="watch-pill"
            onClick={() => setIsStyleModalOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 16px', fontSize: 13, fontWeight: 650 }}
          >
            <Sparkles size={14} />
            <span>Change profile style</span>
          </button>
        </div>
      )}

      {/* Watchlist Section */}
      {canShowLibrary && (
        <>
          <h2 style={{ margin: '0 0 14px', fontSize: 18 }}>Recent Watchlist ({savedAnimes.length})</h2>
          {savedAnimes.length === 0 ? (
            <div className="settings-card" style={{ padding: 32, textAlign: 'center' }}>
              <p style={{ margin: '0 0 12px', color: 'rgb(var(--c-text2))' }}>No saved anime in watchlist yet.</p>
              <Link to="/anime" className="watch-pill">Browse catalog</Link>
            </div>
          ) : (
            <div className="browse-grid">
              {savedAnimes.map((a) => (
                <AnimeCard key={a.routeId} anime={a} variant="grid" />
              ))}
            </div>
          )}
        </>
      )}

      {/* Profile Style Customization Modal */}
      {isOwn && (
        <ProfileStyleModal
          isOpen={isStyleModalOpen}
          onClose={() => setIsStyleModalOpen(false)}
          currentDecoration={profile.avatarDecoration}
          currentBannerEffect={profile.bannerEffect}
          onSave={(dec: AvatarDecorationId, bfx: BannerEffectId) => {
            updateUserProfile({ avatarDecoration: dec, bannerEffect: bfx });
            if (apiClient.isAuthenticated()) {
              apiClient.updateProfile({ avatarDecoration: dec, bannerEffect: bfx }).catch(() => {});
            }
          }}
        />
      )}
    </div>
  );
};
