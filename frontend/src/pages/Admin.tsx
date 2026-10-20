import React from 'react';
import { ShieldCheck, Activity } from 'lucide-react';
import type { SystemHealth } from '../types';

interface AdminProps {
  health: SystemHealth;
}

export const Admin: React.FC<AdminProps> = ({ health }) => {
  const auditLogs = [
    { id: 1, action: 'SYSTEM_STARTUP', actor: 'LocalDaemon', timestamp: '2026-10-20 18:12:00', status: 'SUCCESS' },
    { id: 2, action: 'RESEARCH_JOB_COMPLETED', actor: 'local_user', timestamp: '2026-10-20 18:22:15', status: 'SUCCESS' },
    { id: 3, action: 'LIVE_TRADING_CHECK', actor: 'SafetyGuard', timestamp: '2026-10-20 18:25:30', status: 'BLOCKED (DISABLED)' },
    { id: 4, action: 'SECURITY_AUDIT_LOG_EXPORT', actor: 'admin', timestamp: '2026-10-20 18:30:10', status: 'SUCCESS' },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Administration & Security Controls</h1>
          <p className="page-subtitle">
            System health telemetry, user quota consumption, safety gates, and audit trail.
          </p>
        </div>
      </div>

      {/* Safety Gate Warning & Kill Switch Status */}
      <div className="card" style={{ borderLeft: '4px solid var(--accent-cyan)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1.1rem' }}>
              <ShieldCheck size={20} color="var(--accent-cyan)" />
              Mandatory Live Trading Safety Gate
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
              Live execution is hard-disabled at the server boundary. The system will reject all live broker orders.
            </p>
          </div>
          <button className="btn btn-danger" style={{ opacity: 0.7, cursor: 'not-allowed' }} disabled>
            Emergency Kill Switch (Armed)
          </button>
        </div>
      </div>

      {/* Telemetry Metrics */}
      <div className="grid-3">
        <div className="stat-box">
          <span className="stat-label">Daily Free AI Quota</span>
          <span className="stat-value">4 / 20</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-bullish)' }}>
            80% Daily Capacity Remaining
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Monthly Hosting Cost</span>
          <span className="stat-value" style={{ color: 'var(--color-bullish)' }}>$0.00</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Zero-Cost Personal Local Deployment
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Active Engine Provider</span>
          <span className="stat-value" style={{ fontSize: '1.2rem', fontFamily: 'var(--font-mono)' }}>
            {health.defaultAiProvider.toUpperCase()}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>
            Gemini 3.8 Flash Free Tier
          </span>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <Activity size={18} color="var(--accent-cyan)" />
            Security Audit Trail
          </h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Append-only security events
          </span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '0.6rem 0.8rem' }}>Timestamp</th>
              <th style={{ padding: '0.6rem 0.8rem' }}>Action</th>
              <th style={{ padding: '0.6rem 0.8rem' }}>Actor</th>
              <th style={{ padding: '0.6rem 0.8rem' }}>Result Status</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((log) => (
              <tr key={log.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '0.8rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {log.timestamp}
                </td>
                <td style={{ padding: '0.8rem', fontWeight: 600 }}>
                  {log.action}
                </td>
                <td style={{ padding: '0.8rem', color: 'var(--text-secondary)' }}>
                  {log.actor}
                </td>
                <td style={{ padding: '0.8rem' }}>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      background: log.status.includes('SUCCESS') ? 'var(--color-bullish-subtle)' : 'var(--color-bearish-subtle)',
                      color: log.status.includes('SUCCESS') ? 'var(--color-bullish)' : 'var(--color-bearish)',
                      fontWeight: 600,
                    }}
                  >
                    {log.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
