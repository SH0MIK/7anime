import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Lock, Sparkles, X } from 'lucide-react';
import type { AvatarDecorationId, BannerEffectId } from '../../types/cosmetics';
import {
  AVATAR_DECORATIONS,
  BANNER_EFFECTS,
  isCosmeticUnlocked,
  getCosmeticBadgeLabel,
} from '../../data/cosmeticsCatalog';
import { AvatarDecorationRenderer } from './AvatarDecorationRenderer';
import { BannerEffectRenderer } from './BannerEffectRenderer';
import { useApp } from '../../context/AppContext';

interface ProfileStyleModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDecoration?: AvatarDecorationId;
  currentBannerEffect?: BannerEffectId;
  onSave: (decoration: AvatarDecorationId, bannerEffect: BannerEffectId) => Promise<void> | void;
}

export const ProfileStyleModal: React.FC<ProfileStyleModalProps> = ({
  isOpen,
  onClose,
  currentDecoration = 'none',
  currentBannerEffect = 'none',
  onSave,
}) => {
  const { user, showToast } = useApp();

  const [activeTab, setActiveTab] = useState<'avatar' | 'banner'>('avatar');
  const [selectedDecoration, setSelectedDecoration] = useState<AvatarDecorationId>(currentDecoration);
  const [selectedBannerEffect, setSelectedBannerEffect] = useState<BannerEffectId>(currentBannerEffect);
  const [isSaving, setIsSaving] = useState(false);

  // Group avatar decorations by category
  const avatarCategories = useMemo(() => {
    const cats: { name: string; items: typeof AVATAR_DECORATIONS }[] = [];
    const order: Array<typeof AVATAR_DECORATIONS[number]['category']> = [
      'CLASSICS',
      'SEASONAL',
      'CUTE',
      'NIGHT & TECH',
      'FANTASY',
      'VIP',
    ];

    for (const cat of order) {
      const items = AVATAR_DECORATIONS.filter((item) => item.category === cat);
      if (items.length > 0) {
        cats.push({ name: cat, items });
      }
    }
    return cats;
  }, []);

  if (!isOpen) return null;

  const handleSelectDecoration = (item: typeof AVATAR_DECORATIONS[number]) => {
    const unlocked = isCosmeticUnlocked(item.requirement, user);
    if (!unlocked) {
      const label = getCosmeticBadgeLabel(item.requirement);
      showToast(`${item.name} is locked (${label}). Keep watching & participating to unlock!`, 'info');
      return;
    }
    setSelectedDecoration(item.id);
  };

  const handleSelectBannerEffect = (item: typeof BANNER_EFFECTS[number]) => {
    const unlocked = isCosmeticUnlocked(item.requirement, user);
    if (!unlocked) {
      const label = getCosmeticBadgeLabel(item.requirement);
      showToast(`${item.name} is locked (${label}). Keep watching & participating to unlock!`, 'info');
      return;
    }
    setSelectedBannerEffect(item.id);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(selectedDecoration, selectedBannerEffect);
      showToast('Profile style saved!');
      onClose();
    } catch {
      showToast('Failed to save profile style', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const initial = (user?.username?.trim()?.[0] ?? 'V').toUpperCase();

  return createPortal(
    <div
      className="ytdlg-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-style-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 7, 12, 0.78)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        className="profile-style-panel"
        style={{
          width: 'min(640px, 95vw)',
          maxHeight: '90vh',
          background: '#0e1017',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 20,
          boxShadow: '0 24px 75px rgba(0, 0, 0, 0.85)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* --- Header --- */}
        <div
          style={{
            padding: '20px 24px 14px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2
              id="profile-style-modal-title"
              style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#ffffff' }}
            >
              Profile style
            </h2>
            <button
              type="button"
              className="yt-icon-button"
              aria-label="Close modal"
              onClick={onClose}
              disabled={isSaving}
              style={{
                background: 'transparent',
                border: 0,
                color: 'rgba(255, 255, 255, 0.65)',
                cursor: 'pointer',
                padding: 4,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={18} />
            </button>
          </div>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 12.5,
              color: 'rgba(255, 255, 255, 0.6)',
              lineHeight: 1.45,
            }}
          >
            An animated frame around your picture and an effect over your banner. They show on your profile,
            and the frame beside your name in comments and chat.
          </p>
        </div>

        {/* --- Live Interactive Preview Box --- */}
        <div style={{ padding: '16px 24px 12px' }}>
          <div
            style={{
              position: 'relative',
              height: 110,
              borderRadius: 14,
              overflow: 'hidden',
              background: user?.bannerUrl
                ? `url(${user.bannerUrl}) center/cover no-repeat`
                : `linear-gradient(135deg, ${user?.accentColor || '#8ac4ff'}33, rgba(20, 21, 28, 0.95))`,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Dot Grid Background Overlay */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: 'radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)',
                backgroundSize: '16px 16px',
                pointerEvents: 'none',
              }}
            />

            {/* Selected Banner Effect in live preview */}
            <BannerEffectRenderer effect={selectedBannerEffect} />

            {/* Selected Avatar Decoration in live preview */}
            <div
              style={{
                position: 'relative',
                width: 60,
                height: 60,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 3,
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: user?.avatar ? '#181920' : (user?.accentColor || '#a78bfa'),
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 22,
                  fontWeight: 700,
                  color: '#ffffff',
                }}
              >
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.username}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  initial
                )}
              </div>
              <AvatarDecorationRenderer decoration={selectedDecoration} size={60} />
            </div>
          </div>

          {/* Level / Progression Subtitle */}
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: 'rgba(255, 255, 255, 0.55)',
              lineHeight: 1.4,
            }}
          >
            You&apos;re Level {user?.level ?? 0}. XP comes from watching anime, comments and live chat.
            Seasonal frames open in their season; VIP members have all the rest.
          </div>
        </div>

        {/* --- Segmented Tab Switcher --- */}
        <div style={{ padding: '0 24px 12px' }}>
          <div
            style={{
              display: 'inline-flex',
              padding: 3,
              borderRadius: 999,
              background: 'rgba(255, 255, 255, 0.08)',
              gap: 4,
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('avatar')}
              style={{
                height: 32,
                padding: '0 16px',
                borderRadius: 999,
                border: 0,
                background: activeTab === 'avatar' ? '#ffffff' : 'transparent',
                color: activeTab === 'avatar' ? '#09090b' : 'rgba(255, 255, 255, 0.8)',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Avatar decoration
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('banner')}
              style={{
                height: 32,
                padding: '0 16px',
                borderRadius: 999,
                border: 0,
                background: activeTab === 'banner' ? '#ffffff' : 'transparent',
                color: activeTab === 'banner' ? '#09090b' : 'rgba(255, 255, 255, 0.8)',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Banner effect
            </button>
          </div>
        </div>

        {/* --- Scrollable Content Grid --- */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 24px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {/* TAB 1: AVATAR DECORATION */}
          {activeTab === 'avatar' && (
            <>
              {/* None / Reset Option */}
              <div>
                <button
                  type="button"
                  onClick={() => setSelectedDecoration('none')}
                  style={{
                    width: 76,
                    height: 82,
                    borderRadius: 12,
                    background: selectedDecoration === 'none' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                    border: selectedDecoration === 'none' ? '1.5px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      border: '2px dashed rgba(255, 255, 255, 0.35)',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 10,
                      color: 'rgba(255, 255, 255, 0.5)',
                    }}
                  >
                    None
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#ffffff' }}>None</span>
                </button>
              </div>

              {/* Categorized Cosmetics */}
              {avatarCategories.map((group) => {
                // Filter out 'none' as it's already shown above
                const items = group.items.filter((item) => item.id !== 'none');
                if (items.length === 0) return null;

                return (
                  <div key={group.name}>
                    <div
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: 'rgba(255, 255, 255, 0.5)',
                        marginBottom: 10,
                      }}
                    >
                      {group.name}
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))',
                        gap: 10,
                      }}
                    >
                      {items.map((item) => {
                        const isSelected = selectedDecoration === item.id;
                        const unlocked = isCosmeticUnlocked(item.requirement, user);
                        const badgeLabel = getCosmeticBadgeLabel(item.requirement);

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleSelectDecoration(item)}
                            title={`${item.name}${badgeLabel ? ` (${badgeLabel})` : ''}`}
                            style={{
                              position: 'relative',
                              padding: '12px 6px 8px',
                              borderRadius: 12,
                              background: isSelected
                                ? 'rgba(255, 255, 255, 0.12)'
                                : 'rgba(255, 255, 255, 0.04)',
                              border: isSelected
                                ? '1.5px solid #ffffff'
                                : '1px solid rgba(255, 255, 255, 0.08)',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: unlocked ? 'pointer' : 'default',
                              opacity: unlocked ? 1 : 0.65,
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {/* Lock / Level Badge */}
                            {!unlocked && badgeLabel && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: 4,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  padding: '1px 5px',
                                  borderRadius: 999,
                                  background: 'rgba(245, 158, 11, 0.18)',
                                  border: '1px solid rgba(245, 158, 11, 0.4)',
                                  color: '#fbbf24',
                                  fontSize: 8.5,
                                  fontWeight: 700,
                                  zIndex: 4,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <Lock size={8} />
                                <span>{badgeLabel}</span>
                              </div>
                            )}

                            {/* Avatar Preview with Decoration */}
                            <div
                              style={{
                                position: 'relative',
                                width: 44,
                                height: 44,
                                marginTop: !unlocked && badgeLabel ? 8 : 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <div
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  borderRadius: '50%',
                                  background: user?.avatar
                                    ? '#181920'
                                    : (user?.accentColor || '#a78bfa'),
                                  overflow: 'hidden',
                                  display: 'grid',
                                  placeItems: 'center',
                                  fontSize: 16,
                                  fontWeight: 700,
                                  color: '#ffffff',
                                }}
                              >
                                {user?.avatar ? (
                                  <img
                                    src={user.avatar}
                                    alt=""
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                ) : (
                                  initial
                                )}
                              </div>
                              <AvatarDecorationRenderer decoration={item.id} size={44} />
                            </div>

                            {/* Item Label */}
                            <span
                              style={{
                                marginTop: 6,
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#ffffff',
                                textAlign: 'center',
                                width: '100%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {item.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* TAB 2: BANNER EFFECT */}
          {activeTab === 'banner' && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: 12,
                }}
              >
                {BANNER_EFFECTS.map((item) => {
                  const isSelected = selectedBannerEffect === item.id;
                  const unlocked = isCosmeticUnlocked(item.requirement, user);
                  const badgeLabel = getCosmeticBadgeLabel(item.requirement);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectBannerEffect(item)}
                      title={`${item.name}${badgeLabel ? ` (${badgeLabel})` : ''}`}
                      style={{
                        position: 'relative',
                        borderRadius: 12,
                        background: isSelected
                          ? 'rgba(255, 255, 255, 0.12)'
                          : 'rgba(255, 255, 255, 0.04)',
                        border: isSelected
                          ? '1.5px solid #ffffff'
                          : '1px solid rgba(255, 255, 255, 0.08)',
                        padding: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8,
                        cursor: unlocked ? 'pointer' : 'default',
                        opacity: unlocked ? 1 : 0.65,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {/* Banner Effect Preview Box */}
                      <div
                        style={{
                          position: 'relative',
                          width: '100%',
                          height: 54,
                          borderRadius: 8,
                          overflow: 'hidden',
                          background: 'linear-gradient(135deg, rgba(88, 28, 135, 0.4), rgba(15, 23, 42, 0.95))',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                        }}
                      >
                        {item.id === 'none' ? (
                          <div
                            style={{
                              width: '100%',
                              height: '100%',
                              display: 'grid',
                              placeItems: 'center',
                              fontSize: 11,
                              color: 'rgba(255, 255, 255, 0.4)',
                            }}
                          >
                            None
                          </div>
                        ) : (
                          <BannerEffectRenderer effect={item.id} />
                        )}

                        {/* Lock / Level Badge on top-right of preview */}
                        {!unlocked && badgeLabel && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 4,
                              right: 4,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              padding: '1px 6px',
                              borderRadius: 999,
                              background: 'rgba(245, 158, 11, 0.25)',
                              border: '1px solid rgba(245, 158, 11, 0.5)',
                              color: '#fbbf24',
                              fontSize: 9,
                              fontWeight: 700,
                              zIndex: 4,
                            }}
                          >
                            <Lock size={8} />
                            <span>{badgeLabel}</span>
                          </div>
                        )}
                      </div>

                      {/* Name Label */}
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: '#ffffff',
                          textAlign: 'center',
                        }}
                      >
                        {item.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Informational Banner Upload Note */}
              <div
                style={{
                  marginTop: 8,
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  fontSize: 11.5,
                  color: 'rgba(255, 255, 255, 0.55)',
                  lineHeight: 1.45,
                }}
              >
                Animated banners: pick a GIF (or an animated WebP or PNG) with Change banner on your profile
                and it stays animated. They unlock at Level 2.
              </div>
            </>
          )}
        </div>

        {/* --- Fixed Footer Actions --- */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
            background: '#0e1017',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            style={{
              background: 'transparent',
              border: 0,
              color: 'rgba(255, 255, 255, 0.75)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              padding: '8px 16px',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            style={{
              background: '#ffffff',
              color: '#09090b',
              border: 0,
              borderRadius: 999,
              padding: '7px 22px',
              fontSize: 13,
              fontWeight: 700,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.7 : 1,
              transition: 'opacity 0.15s ease',
            }}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
