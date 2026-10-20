import React from 'react';
import { Search, Wifi, Shield, Download } from 'lucide-react';
import type { SystemHealth } from '../types';

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
