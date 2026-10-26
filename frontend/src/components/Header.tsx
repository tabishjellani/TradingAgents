import React from 'react';
import { Search, Wifi, Shield, Download, User, LogOut, Menu } from 'lucide-react';
import type { SystemHealth } from '../types';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
  health: SystemHealth;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onInstallClick?: () => void;
  canInstall?: boolean;
  onToggleMobileMenu?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  health,
  searchQuery,
  onSearchChange,
  onInstallClick,
  canInstall,
  onToggleMobileMenu,
}) => {
  const isOnline = health.status === 'healthy';
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header className="top-header">
      <div className="header-left">
        {onToggleMobileMenu && (
          <button
            className="mobile-menu-btn"
            onClick={onToggleMobileMenu}
            aria-label="Toggle navigation menu"
            title="Open navigation menu"
          >
            <Menu size={20} />
          </button>
        )}
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
        {user && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'var(--bg-secondary)',
              padding: '0.3rem 0.6rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <User size={14} color="var(--accent-cyan)" />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {user.email}
            </span>
            <span
              style={{
                fontSize: '0.65rem',
                textTransform: 'uppercase',
                padding: '0.1rem 0.35rem',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 700,
                background:
                  user.role === 'admin'
                    ? 'rgba(0, 229, 255, 0.15)'
                    : 'rgba(255, 255, 255, 0.08)',
                color: user.role === 'admin' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              }}
            >
              {user.role}
            </span>
            <button
              onClick={handleSignOut}
              title="Sign Out"
              aria-label="Sign Out"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '2px',
                marginLeft: '4px',
                transition: 'color var(--transition-fast)',
              }}
            >
              <LogOut size={13} />
            </button>
          </div>
        )}

        {canInstall && (
          <button
            className="btn btn-secondary"
            onClick={onInstallClick}
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
          >
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
  );
};
