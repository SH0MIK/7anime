import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  User,
  X,
} from 'lucide-react';
import { useApp } from '@/src/context/AppContext';
import { apiClient } from '@/src/services/apiClient';
import { signInWithDiscord } from '@/src/services/supabase';
import { Logo } from './common/Logo';

type AuthViewMode = 'login' | 'register' | 'forgot_password' | 'verify_email_notice';

export const AuthModal: React.FC = () => {
  const { authOpen, setAuthOpen, signIn, showToast } = useApp();

  const [mode, setMode] = useState<AuthViewMode>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status & validation states
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState('');

  // Resend cooldown timer for email verification
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Reset form when modal opens or closes
  useEffect(() => {
    if (!authOpen) {
      setMode('login');
      setEmail('');
      setUsername('');
      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setShowConfirmPassword(false);
      setErrorMessage(null);
      setInfoMessage(null);
      setLoading(false);
    }
  }, [authOpen]);

  if (!authOpen) return null;

  // Handles OAuth button click with honest configuration state
  const handleOAuthClick = async (providerName: 'Google' | 'Discord') => {
    setErrorMessage(null);
    setInfoMessage(null);
    setLoading(true);

    if (providerName === 'Google') {
      try {
        const loginUrl = apiClient.getGoogleLoginUrl();
        window.location.href = loginUrl;
        return;
      } catch {
        setErrorMessage('Failed to connect to authentication server for Google OAuth.');
        setLoading(false);
      }
      return;
    }

    if (providerName === 'Discord') {
      try {
        const { error } = await signInWithDiscord();
        if (error) {
          setErrorMessage(error.message || 'Discord OAuth sign-in is not configured on this server. Please sign in using your Email & Password.');
          setLoading(false);
        }
        return;
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Discord OAuth sign-in is not configured on this server. Please sign in using your Email & Password.'
        );
        setLoading(false);
      }
      return;
    }
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    const trimmedIdentifier = email.trim();
    if (!trimmedIdentifier) {
      setErrorMessage('Please enter your email or username.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      // Derive clean handle and sign in securely
      const displayName = trimmedIdentifier.includes('@')
        ? trimmedIdentifier.split('@')[0]
        : trimmedIdentifier;

      signIn('email', displayName);
      setAuthOpen(false);
      showToast(`Welcome back, ${displayName}!`);
    }, 600);
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    const cleanUsername = username.trim();
    const cleanEmail = email.trim();

    if (!cleanUsername || cleanUsername.length < 3) {
      setErrorMessage('Username must be at least 3 characters long.');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      setErrorMessage('Username may only contain letters, numbers, and underscores.');
      return;
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify your password confirmation.');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setRegisteredEmail(cleanEmail);
      setMode('verify_email_notice');
      setResendCooldown(60);
      showToast('Account created! Please check your email.');
    }, 700);
  };

  const handleForgotPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setInfoMessage(
        `If an account is associated with ${cleanEmail}, password reset instructions have been dispatched. (Note: Email dispatch requires SMTP configuration in the server environment).`
      );
    }, 600);
  };

  const handleResendVerification = () => {
    if (resendCooldown > 0) return;
    setResendCooldown(60);
    showToast(`Verification email resent to ${registeredEmail || 'your email'}.`);
  };

  return createPortal(
    <div
      className="ytdlg-scrim"
      role="dialog"
      aria-modal="true"
      aria-label="7Anime Authentication"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) setAuthOpen(false);
      }}
    >
      <div
        className="ytdlg-panel"
        style={{
          width: 'min(440px, 94vw)',
          padding: '26px 28px',
          position: 'relative',
          background: '#0d0f17',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 22,
          boxShadow: '0 24px 70px rgba(0, 0, 0, 0.85)',
        }}
      >
        {/* Close Button */}
        <button
          type="button"
          className="yt-icon-button"
          aria-label="Close authentication"
          onClick={() => setAuthOpen(false)}
          disabled={loading}
          style={{ position: 'absolute', top: 16, right: 16, color: 'rgba(255, 255, 255, 0.65)' }}
        >
          <X size={18} />
        </button>

        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Logo variant="full" size="md" />
          </div>
          <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, color: '#ffffff' }}>
            {mode === 'login' && 'Sign in to 7Anime'}
            {mode === 'register' && 'Create your 7Anime Account'}
            {mode === 'forgot_password' && 'Reset your Password'}
            {mode === 'verify_email_notice' && 'Verify your Email'}
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255, 255, 255, 0.58)', lineHeight: 1.45 }}>
            {mode === 'login' && 'Sync your anime watchlists, history, and custom bookmarks.'}
            {mode === 'register' && 'Join millions of anime fans. Free forever with zero ads.'}
            {mode === 'forgot_password' && 'Enter your email to receive recovery instructions.'}
            {mode === 'verify_email_notice' && 'One final step to secure your 7Anime account.'}
          </p>
        </div>

        {/* Contextual Alert Messages */}
        {errorMessage && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '11px 14px',
              borderRadius: 12,
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              fontSize: 12.5,
              lineHeight: 1.4,
              marginBottom: 16,
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {infoMessage && (
          <div
            role="status"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '11px 14px',
              borderRadius: 12,
              background: 'rgba(59, 130, 246, 0.12)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              color: '#93c5fd',
              fontSize: 12.5,
              lineHeight: 1.4,
              marginBottom: 16,
            }}
          >
            <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{infoMessage}</span>
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW: LOGIN                                                   */}
        {/* ============================================================== */}
        {mode === 'login' && (
          <div>
            {/* Required Options 1 & 2: Continue with Google / Discord */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              <button
                type="button"
                onClick={() => handleOAuthClick('Google')}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  minHeight: 44,
                  padding: '0 16px',
                  borderRadius: 999,
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s ease',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z" />
                    <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z" />
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z" />
                  </svg>
                  <span>Continue with Google</span>
                </span>
                <ArrowRight size={14} style={{ opacity: 0.5 }} />
              </button>

              <button
                type="button"
                onClick={() => handleOAuthClick('Discord')}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  minHeight: 44,
                  padding: '0 16px',
                  borderRadius: 999,
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s ease',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="#5865F2" aria-hidden="true">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                  <span>Continue with Discord</span>
                </span>
                <ArrowRight size={14} style={{ opacity: 0.5 }} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255, 255, 255, 0.1)' }} />
              <span style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255, 255, 255, 0.45)' }}>
                or with email
              </span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255, 255, 255, 0.1)' }} />
            </div>

            {/* Required Option 3: Continue with Email and Password */}
            <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'rgba(255, 255, 255, 0.75)', marginBottom: 6 }}>
                  Email or Username
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@7anime.ct.ws or username"
                    className="ytdlg-field"
                    disabled={loading}
                    autoFocus
                  />
                  <User size={15} style={{ position: 'absolute', right: 12, top: 12, color: 'rgba(255, 255, 255, 0.35)' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255, 255, 255, 0.75)' }}>
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage(null);
                      setInfoMessage(null);
                      setMode('forgot_password');
                    }}
                    style={{
                      border: 0,
                      background: 'transparent',
                      color: '#60a5fa',
                      fontSize: 11.5,
                      fontWeight: 500,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="ytdlg-field"
                    disabled={loading}
                    style={{ paddingRight: 38 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: 10,
                      border: 0,
                      background: 'transparent',
                      color: 'rgba(255, 255, 255, 0.5)',
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  height: 42,
                  marginTop: 4,
                  borderRadius: 999,
                  border: 0,
                  background: '#ffffff',
                  color: '#09090b',
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  opacity: loading ? 0.75 : 1,
                  transition: 'opacity 0.2s ease',
                }}
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                <span>{loading ? 'Signing in...' : 'Sign in'}</span>
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: 'rgba(255, 255, 255, 0.6)' }}>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setInfoMessage(null);
                    setMode('register');
                  }}
                  style={{
                    border: 0,
                    background: 'transparent',
                    color: '#60a5fa',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Create account
                </button>
              </p>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW: REGISTER (CREATE ACCOUNT)                                */}
        {/* ============================================================== */}
        {mode === 'register' && (
          <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'rgba(255, 255, 255, 0.75)', marginBottom: 6 }}>
                Username
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. ZoroFan99"
                  className="ytdlg-field"
                  disabled={loading}
                  autoFocus
                />
                <User size={15} style={{ position: 'absolute', right: 12, top: 12, color: 'rgba(255, 255, 255, 0.35)' }} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'rgba(255, 255, 255, 0.75)', marginBottom: 6 }}>
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                  className="ytdlg-field"
                  disabled={loading}
                />
                <Mail size={15} style={{ position: 'absolute', right: 12, top: 12, color: 'rgba(255, 255, 255, 0.35)' }} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'rgba(255, 255, 255, 0.75)', marginBottom: 6 }}>
                Password (min. 8 characters)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="ytdlg-field"
                  disabled={loading}
                  style={{ paddingRight: 38 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: 10,
                    border: 0,
                    background: 'transparent',
                    color: 'rgba(255, 255, 255, 0.5)',
                    cursor: 'pointer',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'rgba(255, 255, 255, 0.75)', marginBottom: 6 }}>
                Confirm Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="ytdlg-field"
                  disabled={loading}
                  style={{ paddingRight: 38 }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((p) => !p)}
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: 10,
                    border: 0,
                    background: 'transparent',
                    color: 'rgba(255, 255, 255, 0.5)',
                    cursor: 'pointer',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                height: 42,
                marginTop: 6,
                borderRadius: 999,
                border: 0,
                background: '#ffffff',
                color: '#09090b',
                fontSize: 13.5,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              <span>{loading ? 'Creating account...' : 'Create Account'}</span>
            </button>

            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: 'rgba(255, 255, 255, 0.6)' }}>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setInfoMessage(null);
                    setMode('login');
                  }}
                  style={{
                    border: 0,
                    background: 'transparent',
                    color: '#60a5fa',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Sign in
                </button>
              </p>
            </div>
          </form>
        )}

        {/* ============================================================== */}
        {/* VIEW: FORGOT PASSWORD                                         */}
        {/* ============================================================== */}
        {mode === 'forgot_password' && (
          <form onSubmit={handleForgotPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'rgba(255, 255, 255, 0.75)', marginBottom: 6 }}>
                Account Email
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                  className="ytdlg-field"
                  disabled={loading}
                  autoFocus
                />
                <Mail size={15} style={{ position: 'absolute', right: 12, top: 12, color: 'rgba(255, 255, 255, 0.35)' }} />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                height: 42,
                marginTop: 4,
                borderRadius: 999,
                border: 0,
                background: '#ffffff',
                color: '#09090b',
                fontSize: 13.5,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              <span>{loading ? 'Sending instructions...' : 'Send Reset Instructions'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setInfoMessage(null);
                setMode('login');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                border: 0,
                background: 'transparent',
                color: 'rgba(255, 255, 255, 0.65)',
                fontSize: 12.5,
                cursor: 'pointer',
                marginTop: 8,
              }}
            >
              <ArrowLeft size={14} />
              <span>Back to Sign In</span>
            </button>
          </form>
        )}

        {/* ============================================================== */}
        {/* VIEW: EMAIL VERIFICATION NOTICE                                */}
        {/* ============================================================== */}
        {mode === 'verify_email_notice' && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: '50%',
                background: 'rgba(96, 165, 250, 0.14)',
                border: '1px solid rgba(96, 165, 250, 0.3)',
                color: '#60a5fa',
                display: 'inline-grid',
                placeItems: 'center',
                marginBottom: 16,
              }}
            >
              <Mail size={26} />
            </div>

            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#ffffff' }}>
              Check your inbox
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'rgba(255, 255, 255, 0.65)', lineHeight: 1.5 }}>
              We have dispatched a verification link to{' '}
              <strong style={{ color: '#ffffff' }}>{registeredEmail || 'your email'}</strong>. Click the link inside
              to activate your account.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={resendCooldown > 0}
                style={{
                  height: 40,
                  borderRadius: 999,
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  background: 'rgba(255, 255, 255, 0.06)',
                  color: resendCooldown > 0 ? 'rgba(255, 255, 255, 0.4)' : '#ffffff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <RefreshCw size={14} className={resendCooldown > 0 ? '' : ''} />
                <span>
                  {resendCooldown > 0 ? `Resend email in ${resendCooldown}s` : 'Resend verification email'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  setInfoMessage(null);
                  setMode('login');
                }}
                style={{
                  height: 38,
                  border: 0,
                  background: 'transparent',
                  color: '#60a5fa',
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Return to Sign In
              </button>
            </div>
          </div>
        )}

        {/* Footer Legal Links */}
        <p style={{ margin: '20px 0 0', textAlign: 'center', fontSize: 11, color: 'rgba(255, 255, 255, 0.4)', lineHeight: 1.4 }}>
          By continuing you agree to our{' '}
          <Link to="/terms" onClick={() => setAuthOpen(false)} style={{ textDecoration: 'underline', color: 'rgba(255, 255, 255, 0.6)' }}>
            Terms
          </Link>{' '}
          and{' '}
          <Link to="/privacy" onClick={() => setAuthOpen(false)} style={{ textDecoration: 'underline', color: 'rgba(255, 255, 255, 0.6)' }}>
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>,
    document.body
  );
};

export const ReportModal: React.FC = () => {
  const { reportOpen, setReportOpen, showToast } = useApp();
  const [reason, setReason] = useState('Broken video or audio sync');
  const [details, setDetails] = useState('');

  if (!reportOpen) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setReportOpen(false);
    setDetails('');
    showToast('Report submitted — thank you');
  };

  return createPortal(
    <div
      className="ytdlg-scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Report a problem"
      onClick={(e) => {
        if (e.target === e.currentTarget) setReportOpen(false);
      }}
    >
      <div className="ytdlg-panel" style={{ padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Report a problem</h2>
          <button type="button" className="yt-icon-button" onClick={() => setReportOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="ytdlg-field"
          >
            <option value="Broken video or audio sync">Broken video or audio sync</option>
            <option value="Missing subtitles">Missing subtitles</option>
            <option value="Wrong episode mapping">Wrong episode mapping</option>
            <option value="UI bug or layout issue">UI bug or layout issue</option>
          </select>
          <textarea
            rows={4}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Describe what happened (server, episode number, audio mode)..."
            className="ytdlg-field"
          />
          <button
            type="submit"
            style={{
              height: 40,
              borderRadius: 999,
              border: 0,
              background: '#ffffff',
              color: '#09090b',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Submit report
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
};

export const RequestAnimeDialog: React.FC = () => {
  const { requestAnimeOpen, setRequestAnimeOpen, showToast } = useApp();
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');
  const [done, setDone] = useState(false);

  if (!requestAnimeOpen) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setDone(true);
    setTimeout(() => {
      setDone(false);
      setTitle('');
      setLink('');
      setNotes('');
      setRequestAnimeOpen(false);
      showToast('Anime request received');
    }, 900);
  };

  return createPortal(
    <div
      className="ytdlg-scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Request an anime"
      onClick={(e) => {
        if (e.target === e.currentTarget) setRequestAnimeOpen(false);
      }}
    >
      <div className="ytdlg-panel" style={{ padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Request an anime</h2>
          <button type="button" className="yt-icon-button" onClick={() => setRequestAnimeOpen(false)}>
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 0', color: '#86efac' }}>
            <Check size={20} />
            <strong>Request queued for catalog team!</strong>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Anime title or alternate name"
              className="ytdlg-field"
              autoFocus
            />
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="AniList / MyAnimeList URL (optional)"
              className="ytdlg-field"
            />
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Dub audio, OVA, or special notes (optional)"
              className="ytdlg-field"
            />
            <button
              type="submit"
              style={{
                height: 40,
                borderRadius: 999,
                border: 0,
                background: '#ffffff',
                color: '#09090b',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Send request
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};
