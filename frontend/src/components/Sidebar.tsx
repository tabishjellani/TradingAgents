import React from 'react';
import {
  LayoutDashboard,
  Cpu,
  Briefcase,
  History,
  Bell,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import type { SystemHealth } from '../types';

export type TabId = 'dashboard' | 'research' | 'portfolio' | 'backtest' | 'alerts' | 'admin';

interface SidebarProps {
  currentTab: TabId;
  onSelectTab: (tab: TabId) => void;
  health: SystemHealth;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab, health }) => {
  const navItems = [
    { id: 'dashboard', label: 'Market Dashboard', icon: LayoutDashboard },
    { id: 'research', label: 'Research Workspace', icon: Cpu },
    { id: 'portfolio', label: 'Paper Portfolio', icon: Briefcase },
    { id: 'backtest', label: 'Backtesting Lab', icon: History },
    { id: 'alerts', label: 'Alerts Center', icon: Bell },
    { id: 'admin', label: 'Administration', icon: ShieldCheck },
  ] as const;

  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="brand-section">
        <div className="brand-logo-icon">
          <Zap size={18} />
        </div>
        <div>
          <div className="brand-title">TradingAgents</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <span className="brand-badge">v{health.version}</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>PWA</span>
          </div>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="nav-menu">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <div
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(item.id)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </div>
          );
        })}
      </nav>

      {/* Safety & Backend Status Footer */}
      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem', marginTop: 'auto' }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Safety & Engine Status
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Live Trading:</span>
            <span style={{ color: health.liveTradingEnabled ? 'var(--color-bearish)' : 'var(--color-bullish)', fontWeight: 600 }}>
              {health.liveTradingEnabled ? 'ENABLED' : 'DISABLED (SAFE)'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>AI Engine:</span>
            <span style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
              {health.defaultAiProvider}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
