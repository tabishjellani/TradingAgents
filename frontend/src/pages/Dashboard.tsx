import React, { useState } from 'react';
import type { MarketQuote } from '../types';
import { TrendingUp, TrendingDown, Clock, Sparkles } from 'lucide-react';

interface DashboardProps {
  quotes: MarketQuote[];
  onSelectTickerForResearch: (symbol: string, assetType: 'stock' | 'crypto') => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ quotes, onSelectTickerForResearch }) => {
  const [filter, setFilter] = useState<'all' | 'stock' | 'crypto'>('all');

  const filteredQuotes = quotes.filter((q) => {
    if (filter === 'all') return true;
    return q.assetType === filter;
  });

  return (
    <div className="page-container">
      {/* Page Title & Subtitle */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Market Dashboard</h1>
          <p className="page-subtitle">
            Real-time and delayed market feeds across global equities and cryptocurrency pairs.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('all')}
          >
            All Assets
          </button>
          <button
            className={`btn ${filter === 'stock' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('stock')}
          >
            Equities
          </button>
          <button
            className={`btn ${filter === 'crypto' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('crypto')}
          >
            Crypto
          </button>
        </div>
      </div>

      {/* Market Macro KPI Cards (Dynamic from real quotes) */}
      <div className="grid-4">
        {['SPY', 'QQQ', 'BTC-USD', 'NVDA'].map((targetSym) => {
          const q = quotes.find((item) => item.symbol === targetSym);
          const isBull = (q?.changePercent ?? 0) >= 0;
          return (
            <div key={targetSym} className="stat-box">
              <span className="stat-label">{targetSym === 'SPY' ? 'S&P 500 (SPY)' : targetSym === 'QQQ' ? 'Nasdaq 100 (QQQ)' : targetSym === 'BTC-USD' ? 'Bitcoin (BTC)' : 'NVIDIA (NVDA)'}</span>
              <span className="stat-value">
                {q ? `$${q.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
              </span>
              <span className={`stat-change ${isBull ? 'bullish' : 'bearish'}`}>
                {isBull ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {q ? `${isBull ? '+' : ''}${q.changePercent.toFixed(2)}% Today` : 'Syncing quote...'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Main Watchlist Table */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <Sparkles size={18} color="var(--accent-cyan)" />
            Live Market Quotes & Watchlist
          </h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={12} /> Feeds served as-of source timestamps
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Symbol / Instrument</th>
                <th style={{ padding: '0.75rem 1rem' }}>Asset Type</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Price</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>24h Change</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>24h Range</th>
                <th style={{ padding: '0.75rem 1rem' }}>Feed Source</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>AI Analysis</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotes.map((q) => {
                const isPos = q.change >= 0;
                return (
                  <tr
                    key={q.symbol}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background var(--transition-fast)',
                    }}
                  >
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontSize: '1rem' }}>
                        {q.symbol}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {q.name}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          background: q.assetType === 'crypto' ? 'rgba(0, 229, 255, 0.15)' : 'rgba(2, 132, 199, 0.15)',
                          color: q.assetType === 'crypto' ? 'var(--accent-cyan)' : 'var(--text-primary)',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                        }}
                      >
                        {q.assetType}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.05rem' }}>
                      ${q.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td
                      style={{
                        padding: '1rem',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                        color: isPos ? 'var(--color-bullish)' : 'var(--color-bearish)',
                      }}
                    >
                      {isPos ? '+' : ''}{q.changePercent.toFixed(2)}%
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      ${q.low24h.toFixed(2)} - ${q.high24h.toFixed(2)}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <div>{q.source}</div>
                      {q.isDelayed && <span style={{ color: 'var(--color-neutral)', fontSize: '0.65rem' }}>15-min delay</span>}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <button
                        className="btn btn-primary"
                        style={{ padding: '0.4rem 0.9rem', fontSize: '0.75rem' }}
                        onClick={() => onSelectTickerForResearch(q.symbol, q.assetType)}
                      >
                        Deep Research
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
