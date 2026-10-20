import React, { useState, useEffect } from 'react';
import { Search, Wifi, Shield, Download, User, LogIn, LogOut } from 'lucide-react';
import type { SystemHealth } from '../types';
import { getAuthToken, setAuthToken } from '../lib/api';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { AuthModal } from './AuthModal';

interface HeaderProps {
  health: SystemHealth;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onInstallClick?: () => void;
  canInstall?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  health,
  searchQuery,
  onSearchChange,
  onInstallClick,
  canInstall,
}) => {
  const isOnline = health.status === 'healthy';
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ email: string; role: string } | null>(null);

  const syncUserSession = async () => {
    if (isSupabaseConfigured) {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setAuthToken(data.session.access_token);
        const role = data.session.user.app_metadata?.role || data.session.user.user_metadata?.role || 'user';
        setCurrentUser({ email: data.session.user.email || 'Authenticated User', role });
        return;
      }
    }

    const token = getAuthToken();
    if (token) {
      if (token.startsWith('test-token:')) {
        const parts = token.split(':');
        setCurrentUser({ email: parts[2] || 'dev@tradingagents.local', role: parts[3] || 'user' });
      } else {
        setCurrentUser({ email: 'Authenticated User', role: 'user' });
      }
    } else {
      setCurrentUser(null);
    }
  };

  useEffect(() => {
    syncUserSession();

    if (isSupabaseConfigured) {
      const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          setAuthToken(session.access_token);
          const role = session.user.app_metadata?.role || session.user.user_metadata?.role || 'user';
          setCurrentUser({ email: session.user.email || 'Authenticated User', role });
        } else {
          setAuthToken(null);
          setCurrentUser(null);
        }
      });

      return () => {
        authListener.subscription.unsubscribe();
      };
    }
  }, []);

  const handleSignOut = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setAuthToken(null);
    setCurrentUser(null);
    window.location.reload();
  };

  return (
    <>
      <header className="top-header">
        <div className="header-left">
          <div className="search-bar">
            <Search size={16} color="var(--text-muted)" />
            <input
              type="text"
              className="search-input"
              placeholder="Search stock ticker or crypto pair (e.g. NVDA, BTC-USD)..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>

        <div className="header-right">
          {/* User Account / Authentication Status */}
          {currentUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-secondary)', padding: '0.3rem 0.6rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <User size={14} color="var(--accent-cyan)" />
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {currentUser.email}
              </span>
              <span style={{
                fontSize: '0.65rem',
                textTransform: 'uppercase',
                padding: '0.1rem 0.35rem',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 700,
                background: currentUser.role === 'admin' ? 'rgba(0, 229, 255, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                color: currentUser.role === 'admin' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              }}>
                {currentUser.role}
              </span>
              <button
                onClick={handleSignOut}
                title="Sign Out"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '2px',
                  marginLeft: '4px',
                }}
              >
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => setIsAuthModalOpen(true)}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
            >
              <LogIn size={14} />
              <span>Sign In / Register</span>
            </button>
          )}

          {canInstall && (
            <button className="btn btn-secondary" onClick={onInstallClick} style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}>
              <Download size={14} />
              <span>Install App</span>
            </button>
          )}

          <div className="status-pill">
            <Shield size={14} color="var(--accent-cyan)" />
            <span>Paper Mode: Active</span>
          </div>

          <div className="status-pill">
            <span className={`status-dot ${isOnline ? 'online' : ''}`} />
            <Wifi size={14} color={isOnline ? 'var(--color-bullish)' : 'var(--text-muted)'} />
            <span>{isOnline ? 'Local Engine Connected' : 'Offline / Standalone'}</span>
          </div>
        </div>
      </header>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={() => syncUserSession()}
      />
    </>
  );
};
