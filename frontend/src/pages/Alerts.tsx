import React, { useState } from 'react';
import { Bell, Plus, CheckCircle, Trash2 } from 'lucide-react';
import type { AlertRule } from '../types';

export const Alerts: React.FC = () => {
  const [alerts, setAlerts] = useState<AlertRule[]>([
    {
      id: 'alt-1',
      symbol: 'NVDA',
      condition: 'above',
      threshold: 145.00,
      isActive: true,
      cooldownMinutes: 60,
      lastTriggered: '2026-10-18 11:20:00',
    },
    {
      id: 'alt-2',
      symbol: 'BTC-USD',
      condition: 'below',
      threshold: 90000.00,
      isActive: true,
      cooldownMinutes: 120,
    },
    {
      id: 'alt-3',
      symbol: 'AAPL',
      condition: 'pct_change',
      threshold: 3.0,
      isActive: true,
      cooldownMinutes: 30,
    },
  ]);

  const [newSymbol, setNewSymbol] = useState('NVDA');
  const [newCondition, setNewCondition] = useState<'above' | 'below' | 'pct_change'>('above');
  const [newThreshold, setNewThreshold] = useState(150.0);

  const handleAddAlert = () => {
    const item: AlertRule = {
      id: `alt-${Date.now().toString().slice(-4)}`,
      symbol: newSymbol,
      condition: newCondition,
      threshold: newThreshold,
      isActive: true,
      cooldownMinutes: 60,
    };
    setAlerts([item, ...alerts]);
  };

  const handleDeleteAlert = (id: string) => {
    setAlerts(alerts.filter((a) => a.id !== id));
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Alerts Center</h1>
          <p className="page-subtitle">
            Configure automated price thresholds and percentage movement monitors evaluated server-side.
          </p>
        </div>
      </div>

      <div className="grid-3" style={{ gridTemplateColumns: '1fr 2fr' }}>
        {/* New Alert Form */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 className="card-title">
            <Plus size={18} color="var(--accent-cyan)" />
            Create Alert Rule
          </h2>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>
              SYMBOL
            </label>
            <input
              type="text"
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>
              CONDITION TYPE
            </label>
            <select
              value={newCondition}
              onChange={(e) => setNewCondition(e.target.value as any)}
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <option value="above">Price Rises Above Target</option>
              <option value="below">Price Drops Below Target</option>
              <option value="pct_change">24h Percentage Change &gt; X%</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>
              THRESHOLD VALUE ({newCondition === 'pct_change' ? '%' : '$'})
            </label>
            <input
              type="number"
              value={newThreshold}
              onChange={(e) => setNewThreshold(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>

          <button className="btn btn-primary" style={{ marginTop: '0.5rem' }} onClick={handleAddAlert}>
            <Bell size={16} /> Save Alert Rule
          </button>
        </div>

        {/* Existing Alerts Table */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <Bell size={18} color="var(--accent-cyan)" />
              Active Alert Monitor List
            </h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Evaluated every 60s
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.6rem 0.8rem' }}>Symbol</th>
                <th style={{ padding: '0.6rem 0.8rem' }}>Condition Rule</th>
                <th style={{ padding: '0.6rem 0.8rem' }}>Status</th>
                <th style={{ padding: '0.6rem 0.8rem' }}>Last Fired</th>
                <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '0.8rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                    {a.symbol}
                  </td>
                  <td style={{ padding: '0.8rem' }}>
                    {a.condition === 'above' && `Price > $${a.threshold.toFixed(2)}`}
                    {a.condition === 'below' && `Price < $${a.threshold.toFixed(2)}`}
                    {a.condition === 'pct_change' && `24h Change > ${a.threshold}%`}
                  </td>
                  <td style={{ padding: '0.8rem' }}>
                    <span style={{ color: 'var(--color-bullish)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                      <CheckCircle size={12} /> Active
                    </span>
                  </td>
                  <td style={{ padding: '0.8rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    {a.lastTriggered || 'Never'}
                  </td>
                  <td style={{ padding: '0.8rem', textAlign: 'center' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.3rem 0.6rem', color: 'var(--color-bearish)' }}
                      onClick={() => handleDeleteAlert(a.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
