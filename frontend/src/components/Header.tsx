import React, { useState } from 'react';
import { Search, Wifi, Shield, Download, UserCheck } from 'lucide-react';
import type { SystemHealth } from '../types';
import { getAuthToken, setAuthToken } from '../lib/api';

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
  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'user'>(
    (getAuthToken() || '').includes(':admin') ? 'admin' : 'user'
  );

  const toggleUserRole = (newRole: 'admin' | 'user') => {
    setCurrentUserRole(newRole);
    if (newRole === 'admin') {
      setAuthToken('test-token:dev-user-01:dev@tradingagents.local:admin');
    } else {
      setAuthToken('test-token:dev-user-02:guest@tradingagents.local:user');
    }
    window.location.reload();
  };

  return (
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
        {/* User Role Switcher for Tenant / RBAC Verification */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-secondary)', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', fontSize: '0.75rem' }}>
          <UserCheck size={14} color="var(--accent-cyan)" />
          <span style={{ color: 'var(--text-secondary)' }}>Active Identity:</span>
          <select
            value={currentUserRole}
            onChange={(e) => toggleUserRole(e.target.value as 'admin' | 'user')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <option value="admin" style={{ background: '#0a0e17' }}>Dev Admin (dev-user-01)</option>
            <option value="user" style={{ background: '#0a0e17' }}>Standard User (dev-user-02)</option>
          </select>
        </div>

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
  );
};
