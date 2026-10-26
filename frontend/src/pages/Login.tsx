import React, { useState } from 'react';
import {
  Zap,
  LogIn,
  UserPlus,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Shield,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type AuthMode = 'signin' | 'signup' | 'forgot';

export const Login: React.FC = () => {
  const { login, signUp, resetPassword, isConfigured } = useAuth();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify both password fields.');
      return;
    }

    if ((mode === 'signin' || mode === 'signup') && password.length < 6) {
      setErrorMessage('Password must contain at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'signin') {
        await login(trimmedEmail, password);
        // On success, AuthProvider state updates automatically
      } else if (mode === 'signup') {
        const result = await signUp(trimmedEmail, password);
        if (result.needsConfirmation) {
          setSuccessMessage(
            'Account created! Supabase has sent a verification link to your email. Please verify your email before logging in.'
          );
        } else {
          setSuccessMessage('Registration successful! Session established.');
        }
      } else if (mode === 'forgot') {
        await resetPassword(trimmedEmail);
        setSuccessMessage('Password reset email sent. Please check your inbox for instructions.');
      }
    } catch (err: any) {
      const msg = err.message || 'Authentication request failed. Please check your credentials.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-primary)',
        backgroundImage:
          'radial-gradient(circle at 15% 15%, rgba(2, 132, 199, 0.12) 0%, transparent 45%), radial-gradient(circle at 85% 85%, rgba(0, 229, 255, 0.08) 0%, transparent 45%)',
        padding: '1.5rem',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '440px',
          background: 'var(--bg-glass)',
          backdropFilter: 'blur(16px)',
          border: '1px solid var(--border-glow)',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), 0 0 24px rgba(0, 229, 255, 0.15)',
          padding: '2.25rem 2rem',
          position: 'relative',
        }}
      >
        {/* Top Brand Identity */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))',
              color: 'var(--text-inverted)',
              boxShadow: 'var(--shadow-glow)',
              marginBottom: '0.85rem',
            }}
          >
            <Zap size={24} />
          </div>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              background: 'linear-gradient(90deg, #ffffff, #94a3b8)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '0.35rem',
            }}
          >
            TradingAgents Terminal
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Institutional Multi-Agent Intelligence & Paper Trading Platform
          </p>
        </div>

        {/* Security / Mode Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-subtle)',
            paddingBottom: '0.85rem',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {mode === 'signin' && <LogIn size={18} color="var(--accent-cyan)" />}
            {mode === 'signup' && <UserPlus size={18} color="var(--accent-cyan)" />}
            {mode === 'forgot' && <KeyRound size={18} color="var(--accent-cyan)" />}
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
              {mode === 'signin' && 'Sign In to Dashboard'}
              {mode === 'signup' && 'Create TradingAgents Account'}
              {mode === 'forgot' && 'Reset Access Password'}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.7rem',
              color: isConfigured ? 'var(--color-bullish)' : 'var(--color-neutral)',
              background: 'var(--bg-secondary)',
              padding: '0.2rem 0.55rem',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <Shield size={12} />
            <span>{isConfigured ? 'Supabase Auth' : 'Dev Auth'}</span>
          </div>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div
            role="alert"
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              borderLeft: '3px solid var(--color-bearish)',
              padding: '0.75rem 0.9rem',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-bearish)',
              fontSize: '0.82rem',
              marginBottom: '1.2rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.6rem',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Success Notification */}
        {successMessage && (
          <div
            role="status"
            style={{
              background: 'rgba(16, 185, 129, 0.12)',
              borderLeft: '3px solid var(--color-bullish)',
              padding: '0.75rem 0.9rem',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-bullish)',
              fontSize: '0.82rem',
              marginBottom: '1.2rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.6rem',
            }}
          >
            <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Authentication Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label
              htmlFor="auth-email-input"
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                display: 'block',
                marginBottom: '0.4rem',
                fontWeight: 600,
                letterSpacing: '0.04em',
              }}
            >
              EMAIL ADDRESS
            </label>
            <input
              id="auth-email-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="trader@tradingagentx.com"
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                fontSize: '0.88rem',
                outline: 'none',
                transition: 'border-color var(--transition-fast)',
              }}
            />
          </div>

          {mode !== 'forgot' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label
                  htmlFor="auth-password-input"
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                  }}
                >
                  PASSWORD
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-cyan)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  id="auth-password-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: '100%',
                    padding: '0.65rem 2.5rem 0.65rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontFamily: 'inherit',
                    fontSize: '0.88rem',
                    outline: 'none',
                    transition: 'border-color var(--transition-fast)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px',
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {mode === 'signup' && (
            <div>
              <label
                htmlFor="auth-confirm-password"
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  display: 'block',
                  marginBottom: '0.4rem',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                }}
              >
                CONFIRM PASSWORD
              </label>
              <input
                id="auth-confirm-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                  fontSize: '0.88rem',
                  outline: 'none',
                  transition: 'border-color var(--transition-fast)',
                }}
              />
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem',
              marginTop: '0.5rem',
              fontWeight: 700,
              letterSpacing: '0.02em',
            }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Loader2 size={16} className="spinner" style={{ animation: 'spin 1s linear infinite' }} />
                <span>Processing...</span>
              </span>
            ) : mode === 'signin' ? (
              'Sign In to Dashboard'
            ) : mode === 'signup' ? (
              'Create Account'
            ) : (
              'Send Password Reset Link'
            )}
          </button>
        </form>

        {/* Footer Navigation */}
        <div
          style={{
            marginTop: '1.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border-subtle)',
            textAlign: 'center',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
          }}
        >
          {mode === 'signin' && (
            <div>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-cyan)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Create an account
              </button>
            </div>
          )}

          {mode === 'signup' && (
            <div>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signin')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-cyan)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Sign In
              </button>
            </div>
          )}

          {mode === 'forgot' && (
            <div>
              <button
                type="button"
                onClick={() => switchMode('signin')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-cyan)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <ArrowLeft size={14} /> Back to Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
