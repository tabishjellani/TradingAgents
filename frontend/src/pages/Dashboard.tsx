import React, { useState, useEffect } from 'react';
import type { MarketQuote, MarketProviderStatus, SymbolSearchResult } from '../types';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Sparkles,
  Search,
  Wifi,
  Database,
  ArrowRight,
} from 'lucide-react';
import { fetchMarketStatus, searchMarketSymbols } from '../lib/api';

interface DashboardProps {
  quotes: MarketQuote[];
  onSelectTickerForResearch: (symbol: string, assetType: 'stock' | 'crypto') => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ quotes, onSelectTickerForResearch }) => {
  const [filter, setFilter] = useState<'all' | 'stock' | 'crypto'>('all');
  const [marketStatus, setMarketStatus] = useState<MarketProviderStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SymbolSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetchMarketStatus().then((status) => {
      if (isMounted && status) {
        setMarketStatus(status);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchMarketSymbols(q);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const filteredQuotes = quotes.filter((q) => {
    if (filter === 'all') return true;
    return q.assetType === filter;
  });

  return (
    <div className="page-container">
      {/* Page Title & Subtitle */}
      <div className="page-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Market Dashboard</h1>
          <p className="page-subtitle">
            Cryptographically authenticated market data feeds across global equities and cryptocurrency pairs.
          </p>
        </div>

        {/* Filter Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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

      {/* Provider Connectivity & Data Freshness Banner */}
      <div
        className="card"
        style={{
          padding: '0.85rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          borderLeft: `4px solid ${
            marketStatus?.status === 'healthy'
              ? 'var(--color-bullish)'
              : marketStatus?.status === 'degraded'
              ? 'var(--color-neutral)'
              : 'var(--color-bearish)'
          }`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Wifi
              size={15}
              color={marketStatus?.status === 'healthy' ? 'var(--color-bullish)' : 'var(--color-neutral)'}
            />
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {marketStatus?.provider || 'Yahoo Finance Dataflow'}
            </span>
          </div>
          <span style={{ color: 'var(--border-subtle)' }}>|</span>
          <span style={{ color: 'var(--text-secondary)' }}>
            Status:{' '}
            <strong
              style={{
                color:
                  marketStatus?.status === 'healthy'
                    ? 'var(--color-bullish)'
                    : marketStatus?.status === 'degraded'
                    ? 'var(--color-neutral)'
                    : 'var(--color-bearish)',
              }}
            >
              {(marketStatus?.status || 'connected').toUpperCase()}
            </strong>
          </span>
          <span style={{ color: 'var(--border-subtle)' }}>|</span>
          <span style={{ color: 'var(--text-muted)' }}>
            Equities: 15m Delayed · Crypto: Real-Time · TTL Caching Active
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Database size={13} color="var(--accent-cyan)" />
            <span>Cache Entries: {marketStatus?.cache_entries ?? quotes.length}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Clock size={13} />
            <span>
              Last Sync:{' '}
              {marketStatus?.last_successful_update
                ? new Date(marketStatus.last_successful_update).toLocaleTimeString()
                : 'Live'}
            </span>
          </div>
        </div>
      </div>

      {/* Symbol Lookup & Quick Search Bar */}
      <div style={{ position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-glow)',
            borderRadius: 'var(--radius-md)',
            padding: '0.65rem 1rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <Search size={18} color="var(--accent-cyan)" />
          <input
            type="text"
            placeholder="Search any global ticker or crypto (e.g. MSFT, TSLA, SOL-USD, ETH-USD)..."
            value={searchQuery}
            onChange={handleSearchChange}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              width: '100%',
              fontSize: '0.9rem',
              fontFamily: 'inherit',
            }}
          />
          {isSearching && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Searching...</span>
          )}
        </div>

        {/* Search Results Dropdown */}
        {searchResults.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-glow)',
              borderRadius: 'var(--radius-md)',
              marginTop: '0.5rem',
              zIndex: 50,
              boxShadow: 'var(--shadow-lg)',
              maxHeight: '320px',
              overflowY: 'auto',
            }}
          >
            {searchResults.map((item) => (
              <div
                key={item.symbol}
                onClick={() => {
                  onSelectTickerForResearch(item.symbol, item.asset_type);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  borderBottom: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  transition: 'background var(--transition-fast)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-glass-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {item.symbol}
                    </span>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        textTransform: 'uppercase',
                        padding: '0.1rem 0.4rem',
                        borderRadius: 'var(--radius-sm)',
                        background: item.asset_type === 'crypto' ? 'rgba(0, 229, 255, 0.15)' : 'rgba(2, 132, 199, 0.15)',
                        color: item.asset_type === 'crypto' ? 'var(--accent-cyan)' : 'var(--text-primary)',
                      }}
                    >
                      {item.asset_type}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {item.name} · {item.exchange}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--accent-cyan)', fontSize: '0.8rem', fontWeight: 600 }}>
                  <span>Launch Research</span>
                  <ArrowRight size={14} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Market Macro KPI Cards (Dynamic from real quotes) */}
      <div className="grid-4">
        {['SPY', 'QQQ', 'BTC-USD', 'NVDA'].map((targetSym) => {
          const q = quotes.find((item) => item.symbol === targetSym);
          const isBull = (q?.changePercent ?? 0) >= 0;
          return (
            <div key={targetSym} className="stat-box">
              <span className="stat-label">
                {targetSym === 'SPY'
                  ? 'S&P 500 (SPY)'
                  : targetSym === 'QQQ'
                  ? 'Nasdaq 100 (QQQ)'
                  : targetSym === 'BTC-USD'
                  ? 'Bitcoin (BTC)'
                  : 'NVIDIA (NVDA)'}
              </span>
              <span className="stat-value">
                {q && q.price > 0 ? (
                  `$${q.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                ) : (
                  '—'
                )}
              </span>
              <span className={`stat-change ${isBull ? 'bullish' : 'bearish'}`}>
                {isBull ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {q && q.price > 0 ? `${isBull ? '+' : ''}${q.changePercent.toFixed(2)}% Today` : 'Syncing quote...'}
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
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Clock size={12} /> Real-time cryptographic datafeed
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                }}
              >
                <th style={{ padding: '0.75rem 1rem' }}>Symbol / Instrument</th>
                <th style={{ padding: '0.75rem 1rem' }}>Asset Type</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Price</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>24h Change</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>24h Range</th>
                <th style={{ padding: '0.75rem 1rem' }}>Feed Source / Freshness</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>AI Analysis</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotes.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No market quotes available.
                  </td>
                </tr>
              ) : (
                filteredQuotes.map((q) => {
                  const isPos = q.change >= 0;
                  const isUnavailable = !q.price || q.price <= 0;

                  return (
                    <tr
                      key={q.symbol}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        transition: 'background var(--transition-fast)',
                      }}
                    >
                      <td style={{ padding: '1rem' }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-primary)',
                            fontSize: '1rem',
                          }}
                        >
                          {q.symbol}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{q.name}</div>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-full)',
                            background:
                              q.assetType === 'crypto'
                                ? 'rgba(0, 229, 255, 0.15)'
                                : 'rgba(2, 132, 199, 0.15)',
                            color: q.assetType === 'crypto' ? 'var(--accent-cyan)' : 'var(--text-primary)',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                          }}
                        >
                          {q.assetType}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: '1rem',
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          fontSize: '1.05rem',
                        }}
                      >
                        {isUnavailable
                          ? 'Unavailable'
                          : `$${q.price.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`}
                      </td>
                      <td
                        style={{
                          padding: '1rem',
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 600,
                          color: isUnavailable
                            ? 'var(--text-muted)'
                            : isPos
                            ? 'var(--color-bullish)'
                            : 'var(--color-bearish)',
                        }}
                      >
                        {isUnavailable ? '—' : `${isPos ? '+' : ''}${q.changePercent.toFixed(2)}%`}
                      </td>
                      <td
                        style={{
                          padding: '1rem',
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.8rem',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {isUnavailable ? '—' : `$${q.low24h.toFixed(2)} - $${q.high24h.toFixed(2)}`}
                      </td>
                      <td style={{ padding: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span>{q.source}</span>
                          <span
                            style={{
                              fontSize: '0.65rem',
                              padding: '1px 5px',
                              borderRadius: 'var(--radius-sm)',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              background:
                                q.feedStatus === 'cached'
                                  ? 'rgba(245, 158, 11, 0.15)'
                                  : q.feedStatus === 'live'
                                  ? 'rgba(16, 185, 129, 0.15)'
                                  : 'rgba(2, 132, 199, 0.15)',
                              color:
                                q.feedStatus === 'cached'
                                  ? 'var(--color-neutral)'
                                  : q.feedStatus === 'live'
                                  ? 'var(--color-bullish)'
                                  : 'var(--accent-cyan)',
                            }}
                          >
                            {q.feedStatus || (q.isDelayed ? '15m Delayed' : 'Live')}
                          </span>
                        </div>
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
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
