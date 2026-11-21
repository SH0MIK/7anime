import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CloudUpload, Sparkles } from 'lucide-react';
import { useApp } from '@/src/context/AppContext';
import { apiClient } from '@/src/services/apiClient';
import { signInWithDiscord, supabase } from '@/src/services/supabase';
import { AvatarBadge } from '@/src/components/BrandMark';
import { BannerEffectRenderer } from '@/src/components/profile/BannerEffectRenderer';
import { ProfileStyleModal } from '@/src/components/profile/ProfileStyleModal';
import { AVATAR_DECORATIONS, BANNER_EFFECTS as CATALOG_BANNER_EFFECTS } from '@/src/data/cosmeticsCatalog';
import type { ProfileVisibility, UserProfile } from '@/src/types/user';
import type { AvatarDecorationId, BannerEffectId } from '@/src/types/cosmetics';

/* Shared Account section (Overview, Profile, Visibility, Connected accounts, Password, Devices).
   Used by /settings (full Account section) and /profile (editable cards). */

export const BANNER_EFFECTS: UserProfile['bannerEffect'][] = [
  'none',
  'sakura',
  'snowfall',
  'night_sky',
  'fireflies',
  'aurora',
  'embers',
  'hearts',
  'neon_rain',
  'autumn_leaves',
  'confetti',
  'bubbles',
  'fireworks',
  'thunderstorm',
  'code_rain',
];

export const FRAME_STYLES: UserProfile['frameStyle'][] = [
  'none',
  'crown',
  'celestial',
  'crimson',
  'neon',
];

export type AccountSub = 'overview' | 'profile' | 'visibility' | 'connected' | 'password' | 'devices';

export const ACCOUNT_SUBS: { id: AccountSub; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'profile', label: 'Profile' },
  { id: 'visibility', label: 'Visibility' },
  { id: 'connected', label: 'Connected accounts' },
  { id: 'password', label: 'Password' },
  { id: 'devices', label: 'Devices' },
];

/** Best-effort sync to the backend; silently skipped when there is no Supabase session. */
async function syncRemote(patch: {
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  avatarDecoration?: string;
  bannerEffect?: string;
  frameStyle?: string;
  bio?: string;
}) {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) await apiClient.updateProfile(patch);
  } catch {
    /* local profile is already saved */
  }
}

/** Resize an image file to a compact JPEG data URL. */
function fileToDataUrl(file: File, maxW: number, maxH: number, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width, maxH / img.height);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}

/** Read image file directly to Data URL without canvas compression (preserves animated GIFs/WebP). */
function fileToRawDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to read file as data URL'));
    };
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });
}

const AVATAR_COLOURS = ['#e8729a', '#f2c9a8', '#a99bdc', '#8ec9d4', '#d98aa0', '#b8d68c'];

const GLOW_COLOURS = [
  null,
  '#ff5f8f',
  '#ff7a45',
  '#f5c242',
  '#5fd68a',
  '#38bdf8',
  '#7c83ff',
  '#ff5a5a',
  '#b36bff',
  '#2dd4bf',
  '#e08fd6',
] as const;

const DEFAULT_VISIBILITY: ProfileVisibility = {
  publicProfile: true,
  showComments: true,
  showLibrary: true,
  showSocial: true,
};

const VISIBILITY_ROWS: { key: keyof ProfileVisibility; label: string }[] = [
  { key: 'publicProfile', label: 'Make my profile public' },
  { key: 'showComments', label: 'Show my comments on my profile' },
  { key: 'showLibrary', label: 'Show my library & watch history' },
  { key: 'showSocial', label: 'Show my followers & following' },
];

const NAME_MAX = 40;
const BIO_MAX = 280;

export const glowStyle = (hex?: string | null): React.CSSProperties =>
  hex ? { color: hex, textShadow: `0 0 12px ${hex}99, 0 0 2px ${hex}` } : {};

/* ---------- Editable profile + visibility (own profile only) ---------- */
export const ProfileEditor: React.FC<{ profile: UserProfile }> = ({ profile }) => {
  const { updateUserProfile, showToast } = useApp();

  const saved = useMemo(
    () => ({
      name: profile.username,
      bio: profile.bio ?? '',
      colour: profile.accentColor,
      glow: profile.usernameGlow ?? null,
      vis: { ...DEFAULT_VISIBILITY, ...(profile.visibility ?? {}) },
    }),
    [profile.username, profile.bio, profile.accentColor, profile.usernameGlow, profile.visibility]
  );

  const [name, setName] = useState(saved.name);
  const [bio, setBio] = useState(saved.bio);
  const [colour, setColour] = useState(saved.colour);
  const [glow, setGlow] = useState<string | null>(saved.glow);
  const [vis, setVis] = useState<ProfileVisibility>(saved.vis);

  const trimmed = name.trim();
  const dirty =
    trimmed !== saved.name ||
    bio !== saved.bio ||
    colour !== saved.colour ||
    glow !== saved.glow ||
    (Object.keys(vis) as (keyof ProfileVisibility)[]).some((k) => vis[k] !== saved.vis[k]);
  const canSave = dirty && trimmed.length > 0;

  const customGlowActive = glow !== null && !GLOW_COLOURS.includes(glow as (typeof GLOW_COLOURS)[number]);

  const handleSave = () => {
    if (!canSave) return;
    updateUserProfile({
      username: trimmed,
      bio,
      accentColor: colour,
      usernameGlow: glow,
      visibility: vis,
    });
    void syncRemote({ displayName: trimmed, bio });
    showToast('Profile saved');
  };

  return (
    <>
      <section id="pf-profile" className="pf-card" aria-labelledby="pf-profile-title">
        <h2 id="pf-profile-title" className="pf-card__title">Profile</h2>

        <div className="pf-field">
          <div className="pf-label" id="pf-avatar-label">Avatar colour</div>
          <div className="pf-swatches" role="radiogroup" aria-labelledby="pf-avatar-label">
            <span className="pf-avatar-preview" style={{ background: colour }} aria-hidden="true">
              {(trimmed[0] ?? profile.username[0] ?? 'A').toUpperCase()}
            </span>
            {AVATAR_COLOURS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={colour.toLowerCase() === c}
                aria-label={`Avatar colour ${c}`}
                className={`pf-dot ${colour.toLowerCase() === c ? 'is-selected' : ''}`}
                style={{ background: c }}
                onClick={() => setColour(c)}
              />
            ))}
          </div>
        </div>

        <div className="pf-field">
          <label className="pf-label" htmlFor="pf-name">Display name</label>
          <input
            id="pf-name"
            className="pf-input"
            type="text"
            value={name}
            maxLength={NAME_MAX}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
          />
          <div className="pf-field__footer">
            <span className="pf-muted">Use up to 40 characters.</span>
            <span className="pf-counter" aria-live="polite">
              {trimmed.length}/{NAME_MAX}
            </span>
          </div>
        </div>

        <div className="pf-field">
          <label className="pf-label" htmlFor="pf-bio">About me</label>
          <textarea
            id="pf-bio"
            className="pf-input pf-input--area"
            rows={3}
            value={bio}
            maxLength={BIO_MAX}
            placeholder="Tell other anime fans a bit about yourself..."
            onChange={(e) => setBio(e.target.value)}
          />
          <div className="pf-field__footer">
            <span className="pf-muted">Appears on your public profile.</span>
            <span className="pf-counter" aria-live="polite">
              {bio.length}/{BIO_MAX}
            </span>
          </div>
        </div>

        <div className="pf-field">
          <div className="pf-label" id="pf-glow-label">Username glow</div>
          <div className="pf-swatches" role="radiogroup" aria-labelledby="pf-glow-label">
            {GLOW_COLOURS.map((c) => (
              <button
                key={c ?? 'none'}
                type="button"
                role="radio"
                aria-checked={glow === c}
                aria-label={c ? `Username glow ${c}` : 'No username glow'}
                className={`pf-aa ${glow === c ? 'is-selected' : ''}`}
                style={c ? { ['--glow' as string]: c } : undefined}
                onClick={() => setGlow(c)}
              >
                <span style={glowStyle(c)}>Aa</span>
              </button>
            ))}
            <label
              className={`pf-dot pf-dot--picker ${customGlowActive ? 'is-selected' : ''}`}
              style={{ background: customGlowActive && glow ? glow : '#ffd166' }}
              title="Custom glow colour"
            >
              <input
                type="color"
                aria-label="Custom username glow colour"
                value={customGlowActive && glow ? glow : '#ffd166'}
                onChange={(e) => setGlow(e.target.value)}
              />
            </label>
          </div>
          <div className="pf-preview">
            Preview: <span style={glowStyle(glow)}>{trimmed || profile.username}</span>
          </div>
        </div>
      </section>

      <section id="pf-visibility" className="pf-card" aria-labelledby="pf-vis-title">
        <h2 id="pf-vis-title" className="pf-card__title">Visibility</h2>
        <div className="pf-subtitle">Visibility</div>

        <ul className="pf-toggles">
          {VISIBILITY_ROWS.map(({ key, label }) => (
            <li key={key} className="pf-toggle">
              <span id={`pf-vis-${key}`}>{label}</span>
              <button
                type="button"
                role="switch"
                aria-checked={vis[key]}
                aria-labelledby={`pf-vis-${key}`}
                className="pf-switch"
                data-checked={vis[key]}
                onClick={() => setVis((v) => ({ ...v, [key]: !v[key] }))}
              />
            </li>
          ))}
        </ul>

        <div className="pf-actions">
          <button type="button" className="pf-save" disabled={!canSave} onClick={handleSave}>
            Save profile
          </button>
        </div>
      </section>
    </>
  );
};

/* ---------- Profile style picker (banner effect + avatar frame) ---------- */
export const ProfileStylePicker: React.FC = () => {
  const { user, updateUserProfile } = useApp();
  if (!user) return null;
  return (
    <div className="pf-stylepicker">
      <div>
        <div className="pf-label">Banner effect</div>
        <div className="pf-chips">
          {BANNER_EFFECTS.map((eff) => (
            <button
              key={eff}
              type="button"
              className="pf-chip"
              aria-pressed={user.bannerEffect === eff}
              onClick={() => updateUserProfile({ bannerEffect: eff })}
            >
              {eff.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="pf-label">Avatar frame</div>
        <div className="pf-chips">
          {FRAME_STYLES.map((fr) => (
            <button
              key={fr}
              type="button"
              className="pf-chip"
              aria-pressed={user.frameStyle === fr}
              onClick={() => updateUserProfile({ frameStyle: fr })}
            >
              {fr}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ---------- Overview card ---------- */
const AccountOverview: React.FC<{ user: UserProfile }> = ({ user }) => {
  const { updateUserProfile, showToast } = useApp();
  const photoInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);

  const [email, setEmail] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [createdAt, setCreatedAt] = useState<string | null>(null);

  const [editHandle, setEditHandle] = useState(false);
  const [handleDraft, setHandleDraft] = useState('');
  const [editEmail, setEditEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');

  useEffect(() => {
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!alive || !data.session) return;
        const u = data.session.user;
        setEmail(u.email ?? null);
        setVerified(Boolean(u.email_confirmed_at));
        setCreatedAt(u.created_at ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const memberSince = createdAt
    ? new Date(createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : user.joinedAt;

  const pickPhoto = useCallback(
    async (file?: File | null) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) return showToast('Choose an image file', 'error');
      if (file.size > 50 * 1024 * 1024) return showToast('Photo must be 50 MB or smaller', 'error');

      const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
      const isWebP = file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp');

      try {
        let dataUrl: string;
        if (isGif || isWebP) {
          dataUrl = await fileToRawDataUrl(file);
        } else {
          dataUrl = await fileToDataUrl(file, 320, 320, 0.88);
        }
        updateUserProfile({ avatar: dataUrl });
        void syncRemote({ avatarUrl: dataUrl });
        showToast('Photo updated');
      } catch {
        showToast('Could not read that image', 'error');
      }
    },
    [showToast, updateUserProfile]
  );

  const pickBanner = useCallback(
    async (file?: File | null) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) return showToast('Choose an image file', 'error');
      if (file.size > 50 * 1024 * 1024) return showToast('Banner must be 50 MB or smaller', 'error');

      const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
      const isWebP = file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp');

      // Animated banners check (requires Level 2 or VIP as per ANI.PM rules)
      if (isGif || isWebP) {
        const userLevel = user.level ?? 0;
        if (userLevel < 2 && !user.isVip) {
          showToast('Animated banners unlock at Level 2 (or VIP membership)', 'info');
        }
      }

      try {
        let bannerData: string;
        if (isGif || isWebP) {
          bannerData = await fileToRawDataUrl(file);
        } else {
          bannerData = await fileToDataUrl(file, 1280, 360, 0.82);
        }
        updateUserProfile({ banner: bannerData, bannerUrl: bannerData });
        void syncRemote({ bannerUrl: bannerData });
        showToast('Banner updated');
      } catch {
        showToast('Could not read that image', 'error');
      }
    },
    [showToast, updateUserProfile, user.level, user.isVip]
  );

  const saveHandle = () => {
    const v = handleDraft.trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(v)) {
      showToast('Use 3–20 letters, numbers or underscores', 'error');
      return;
    }
    updateUserProfile({ handle: `@${v}` });
    void syncRemote({ username: v });
    setEditHandle(false);
    showToast('Username updated');
  };

  const saveEmail = async () => {
    const v = emailDraft.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      showToast('Enter a valid email address', 'error');
      return;
    }
    const { error } = await supabase.auth.updateUser({ email: v });
    if (error) {
      showToast(error.message || 'Could not change email', 'error');
      return;
    }
    setEditEmail(false);
    showToast('Check your inbox to confirm the new email');
  };

  const activeBanner = user.bannerUrl || user.banner;
  const bannerBg = activeBanner
    ? { backgroundImage: `url(${activeBanner})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : {
        background: `linear-gradient(to bottom, transparent 35%, #121212), radial-gradient(ellipse 100% 140% at 0% 0%, ${user.accentColor}, transparent 72%), #232323`,
      };

  const activeDecoObj = AVATAR_DECORATIONS.find((d) => d.id === user.avatarDecoration);
  const activeBfxObj = CATALOG_BANNER_EFFECTS.find((b) => b.id === user.bannerEffect);

  return (
    <section id="pf-overview" className="pf-card" aria-labelledby="pf-overview-title" style={{ scrollMarginTop: 84 }}>
      <h3 id="pf-overview-title" className="pf-card__title">Overview</h3>

      <div className="pf-field pf-field--tight">
        <div className="pf-identity">
          <div style={{ position: 'relative', width: 84, height: 84, flexShrink: 0 }}>
            <AvatarBadge
              username={user.username}
              avatar={user.avatar}
              color={user.accentColor}
              size={84}
              decoration={user.avatarDecoration}
              frameStyle={user.frameStyle}
            />
            <button
              type="button"
              className="pf-avatar-lg__cam"
              aria-label="Change photo"
              onClick={() => photoInput.current?.click()}
              style={{ position: 'absolute', bottom: 2, right: 2, zIndex: 6 }}
            >
              <Camera size={13} aria-hidden="true" />
            </button>
          </div>
          <div>
            <div className="pf-identity__name">
              <span style={glowStyle(user.usernameGlow)}>{user.username}</span>
              <span className="pf-lv">LV {user.level}</span>
            </div>
            <div className="pf-muted">{user.handle}</div>
          </div>
        </div>

        <button type="button" className="pf-pill" onClick={() => photoInput.current?.click()}>
          Upload photo
        </button>
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void pickPhoto(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <div
          className={`pf-drop ${dragOver ? 'is-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void pickPhoto(e.dataTransfer.files?.[0]);
          }}
        >
          <span className="pf-drop__icon"><CloudUpload size={22} aria-hidden="true" /></span>
          <div className="pf-drop__text">
            <strong>Drop a photo here</strong>
            <span>Up to 50 MB.</span>
          </div>
          <button type="button" className="pf-pill pf-pill--outline pf-pill--sm" onClick={() => photoInput.current?.click()}>
            Browse
          </button>
        </div>
      </div>

      <div className="pf-field">
        <div className="pf-label">Profile banner</div>
        <div
          className="pf-banner-preview"
          style={{ ...bannerBg, position: 'relative', overflow: 'hidden' }}
          role="img"
          aria-label="Profile banner preview"
        >
          {user.bannerEffect && user.bannerEffect !== 'none' && (
            <BannerEffectRenderer effect={user.bannerEffect} />
          )}
        </div>
        <div className="pf-row pf-row--mt">
          <button type="button" className="pf-pill" onClick={() => bannerInput.current?.click()}>
            Upload banner
          </button>
          {activeBanner && (
            <button
              type="button"
              className="pf-pill pf-pill--ghost"
              onClick={() => {
                updateUserProfile({ banner: null, bannerUrl: null });
                void syncRemote({ bannerUrl: '' });
              }}
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={bannerInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void pickBanner(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      <div className="pf-field">
        <div className="pf-label">Profile style</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="pf-pill"
            onClick={() => setIsStyleModalOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Sparkles size={14} />
            <span>Change profile style</span>
          </button>
          <span className="pf-muted" style={{ fontSize: 13 }}>
            Active: <strong>{activeDecoObj?.name || 'None'}</strong> · <strong>{activeBfxObj?.name || 'None'}</strong>
          </span>
        </div>
      </div>

      <div className="pf-field">
        <div className="pf-label">Username</div>
        {editHandle ? (
          <div className="pf-row">
            <input
              className="pf-input pf-input--inline"
              value={handleDraft}
              maxLength={21}
              aria-label="New username"
              autoFocus
              onChange={(e) => setHandleDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveHandle()}
            />
            <button type="button" className="pf-pill" onClick={saveHandle}>Save</button>
            <button type="button" className="pf-pill pf-pill--ghost" onClick={() => setEditHandle(false)}>Cancel</button>
          </div>
        ) : (
          <div className="pf-row">
            <span className="pf-value">{user.handle}</span>
            <button
              type="button"
              className="pf-pill"
              onClick={() => {
                setHandleDraft(user.handle.replace(/^@/, ''));
                setEditHandle(true);
              }}
            >
              Change
            </button>
          </div>
        )}
      </div>

      <div className="pf-field">
        <div className="pf-label">Email</div>
        {editEmail ? (
          <div className="pf-row">
            <input
              className="pf-input pf-input--inline"
              type="email"
              value={emailDraft}
              aria-label="New email"
              autoFocus
              onChange={(e) => setEmailDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void saveEmail()}
            />
            <button type="button" className="pf-pill" onClick={() => void saveEmail()}>Send confirmation</button>
            <button type="button" className="pf-pill pf-pill--ghost" onClick={() => setEditEmail(false)}>Cancel</button>
          </div>
        ) : email ? (
          <div className="pf-row">
            <span className="pf-value">{email}</span>
            {verified && <span className="pf-badge">VERIFIED</span>}
            <button
              type="button"
              className="pf-pill"
              onClick={() => {
                setEmailDraft(email);
                setEditEmail(true);
              }}
            >
              Change
            </button>
          </div>
        ) : (
          <span className="pf-muted">No email is linked to this sign-in.</span>
        )}
      </div>

      <div className="pf-field">
        <div className="pf-label">Member since</div>
        <span className="pf-value">{memberSince}</span>
      </div>

      <div className="pf-field">
        <div className="pf-label">Level</div>
        <div className="pf-row">
          <span className="pf-value">Level {user.level}</span>
          {user.provider === 'discord' && <span className="pf-badge">DISCORD</span>}
        </div>
      </div>

      {/* Profile Style Modal */}
      <ProfileStyleModal
        isOpen={isStyleModalOpen}
        onClose={() => setIsStyleModalOpen(false)}
        currentDecoration={user.avatarDecoration}
        currentBannerEffect={user.bannerEffect}
        onSave={(dec: AvatarDecorationId, bfx: BannerEffectId) => {
          updateUserProfile({ avatarDecoration: dec, bannerEffect: bfx });
          void syncRemote({ avatarDecoration: dec, bannerEffect: bfx });
        }}
      />
    </section>
  );
};

/* ---------- Connected accounts ---------- */
const GoogleG: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
    <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);

const DiscordMark: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="#5865F2">
    <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.5a18.3 18.3 0 0 0-6.4 0L8.6 3a19.7 19.7 0 0 0-4.9 1.4C.6 9 0 13.5.3 18a19.9 19.9 0 0 0 6 3l.8-1.3a12.7 12.7 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4a12.7 12.7 0 0 1-2 1l.8 1.3a19.9 19.9 0 0 0 6-3c.4-5.2-.7-9.7-3.8-13.6zM8.5 15.3c-1.2 0-2.1-1.100-2.1-2.400s.9-2.400 2.100-2.400 2.100 1.100 2.100 2.400-.9 2.400-2.100 2.400zm7 0c-1.200 0-2.100-1.100-2.100-2.400s.9-2.400 2.100-2.400 2.100 1.100 2.100 2.400-.9 2.400-2.100 2.400z" />
  </svg>
);

const ConnectedAccounts: React.FC<{ user: UserProfile }> = ({ user }) => {
  const { showToast } = useApp();

  const linkGoogle = () => {
    try {
      window.location.href = apiClient.getGoogleLoginUrl();
    } catch {
      showToast('Google sign-in is not available right now', 'error');
    }
  };

  const linkDiscord = async () => {
    const { error } = await signInWithDiscord();
    if (error) showToast(error.message || 'Discord sign-in is not configured on this server', 'error');
  };

  return (
    <section id="pf-connected" className="pf-card" aria-labelledby="pf-connected-title" style={{ scrollMarginTop: 84 }}>
      <h3 id="pf-connected-title" className="pf-card__title">Connected accounts</h3>

      <div className="pf-field">
        <div className="pf-label">Google</div>
        {user.provider === 'google' ? (
          <span className="pf-pill pf-pill--static"><GoogleG /> Connected</span>
        ) : (
          <button type="button" className="pf-pill" onClick={linkGoogle}>
            <GoogleG /> Link Google
          </button>
        )}
      </div>

      <div className="pf-field">
        <div className="pf-label">Discord</div>
        {user.provider === 'discord' ? (
          <span className="pf-pill pf-pill--static"><DiscordMark /> Connected</span>
        ) : (
          <button type="button" className="pf-pill" onClick={() => void linkDiscord()}>
            <DiscordMark /> Link Discord
          </button>
        )}
      </div>
    </section>
  );
};

/* ---------- Password ---------- */
const PasswordCard: React.FC<{ user: UserProfile }> = ({ user }) => {
  const { showToast } = useApp();
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => alive && setEmail(data.session?.user.email ?? null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const sendReset = async () => {
    if (!email) return;
    setBusy(true);
    try {
      const res = await apiClient.sendPasswordReset(email);
      if (res?.success === false) throw new Error(res.error || 'Could not send reset email');
      showToast('Password reset email sent');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not send reset email', 'error');
    } finally {
      setBusy(false);
    }
  };

  const viaOAuth = user.provider === 'google' || user.provider === 'discord';

  return (
    <section id="pf-password" className="pf-card" aria-labelledby="pf-password-title" style={{ scrollMarginTop: 84 }}>
      <h3 id="pf-password-title" className="pf-card__title">Password</h3>
      <p className="pf-muted pf-p">
        {viaOAuth
          ? `You sign in with ${user.provider === 'google' ? 'Google' : 'Discord'}. You can still set a password by email.`
          : 'We will email you a link to choose a new password.'}
      </p>
      <button type="button" className="pf-pill" disabled={!email || busy} onClick={() => void sendReset()}>
        {busy ? 'Sending…' : 'Send reset email'}
      </button>
      {!email && <p className="pf-muted pf-p pf-p--mt">No email is linked to this sign-in.</p>}
    </section>
  );
};

/* ---------- Devices ---------- */
function describeDevice(): string {
  if (typeof navigator === 'undefined') return 'This device';
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${browser} on ${os}`;
}

const DevicesCard: React.FC = () => {
  const { signOut } = useApp();
  const label = useMemo(describeDevice, []);
  return (
    <section id="pf-devices" className="pf-card" aria-labelledby="pf-devices-title" style={{ scrollMarginTop: 84 }}>
      <h3 id="pf-devices-title" className="pf-card__title">Devices</h3>
      <div className="pf-toggle">
        <div>
          <div className="pf-value">{label}</div>
          <span className="pf-badge">THIS DEVICE</span>
        </div>
        <button type="button" className="pf-pill" onClick={signOut}>Sign out</button>
      </div>
    </section>
  );
};

/* ---------- Full Account section (Settings page) ---------- */
export const AccountSection: React.FC<{ onActive?: (id: AccountSub) => void }> = ({ onActive }) => {
  const { user } = useApp();

  useEffect(() => {
    if (!onActive || typeof IntersectionObserver === 'undefined') return;
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        });
        const first = [...visible.entries()].sort((a, b) => a[1] - b[1])[0];
        if (first) onActive(first[0].replace('pf-', '') as AccountSub);
      },
      { rootMargin: '-15% 0px -60% 0px' }
    );
    ACCOUNT_SUBS.forEach((s) => {
      const el = document.getElementById(`pf-${s.id}`);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [onActive]);

  if (!user) return null;

  return (
    <div className="pf-stack">
      <AccountOverview user={user} />
      <ProfileEditor
        key={[user.username, user.bio, user.accentColor, user.usernameGlow ?? '', JSON.stringify(user.visibility ?? {})].join('|')}
        profile={user}
      />
      <ConnectedAccounts user={user} />
      <PasswordCard user={user} />
      <DevicesCard />
    </div>
  );
};
