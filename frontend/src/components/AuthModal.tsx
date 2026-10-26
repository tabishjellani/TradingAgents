import React, { useState } from 'react';
import { LogIn, UserPlus, X, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { login, signUp, isConfigured } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setSuccessNotice(null);

    try {
      if (mode === 'signup') {
        const res = await signUp(email, password);
        if (res.needsConfirmation) {
          setSuccessNotice('Account created! Please check your email for the confirmation link.');
        } else {
          onSuccess();
          onClose();
        }
      } else {
        await login(email, password);
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(5, 7, 10, 0.8)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-lg)',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          <X size={18} />
        </button>

        <h2 className="card-title" style={{ marginBottom: '0.5rem' }}>
          {mode === 'signin' ? (
            <LogIn size={20} color="var(--accent-cyan)" />
          ) : (
            <UserPlus size={20} color="var(--accent-cyan)" />
          )}
          {mode === 'signin' ? 'Sign In to TradingAgents' : 'Create an Account'}
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
          {isConfigured
            ? 'Access your private research reports, paper portfolios, and alert triggers.'
            : 'Local Development Auth Mode (Offline Session)'}
        </p>

        {errorMessage && (
          <div
            style={{
              background: 'rgba(255, 68, 68, 0.1)',
              borderLeft: '3px solid var(--color-bearish)',
              padding: '0.6rem 0.8rem',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-bearish)',
              fontSize: '0.8rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {successNotice && (
          <div
            style={{
              background: 'rgba(0, 230, 118, 0.1)',
              borderLeft: '3px solid var(--color-bullish)',
              padding: '0.6rem 0.8rem',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-bullish)',
              fontSize: '0.8rem',
              marginBottom: '1rem',
            }}
          >
            {successNotice}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                display: 'block',
                marginBottom: '0.3rem',
                fontWeight: 600,
              }}
            >
              EMAIL ADDRESS
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: '100%',
                padding: '0.6rem 0.8rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div>
            <label
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                display: 'block',
                marginBottom: '0.3rem',
                fontWeight: 600,
              }}
            >
              PASSWORD (MIN 6 CHARACTERS)
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '0.6rem 0.8rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem' }}
          >
            {loading ? 'Processing...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {mode === 'signin' ? (
            <>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setErrorMessage(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-cyan)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Sign Up
              </button>
            </>
          ) : (
            <>
              Already registered?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setErrorMessage(null);
                }}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
};
