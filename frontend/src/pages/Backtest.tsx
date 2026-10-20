import React, { useState } from 'react';
import { History, Play, BarChart3, ShieldCheck, AlertCircle } from 'lucide-react';
import { runBacktest } from '../lib/api';

export const Backtest: React.FC = () => {
  const [tickers, setTickers] = useState('NVDA, AAPL, MSFT');
  const [startDate, setStartDate] = useState('2026-06-01');
  const [endDate, setEndDate] = useState('2026-09-01');
  const [interval, setInterval] = useState(7);
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [backtestResult, setBacktestResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRunBacktest = async () => {
    setIsRunning(true);
    setErrorMessage(null);
    try {
      const tickerList = tickers.split(',').map((t) => t.trim()).filter(Boolean);
      const res = await runBacktest({
        tickers: tickerList,
        start_date: startDate,
        end_date: endDate,
        every_n_days: Number(interval),
      });
      setBacktestResult(res);
      setHasRun(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Backtest simulation failed.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Backtesting Lab</h1>
          <p className="page-subtitle">
            Evaluate past multi-agent decision quality across historical grids with zero look-ahead bias.
          </p>
        </div>
        <div className="status-pill" style={{ background: 'rgba(0, 229, 255, 0.15)', color: 'var(--accent-cyan)' }}>
          <ShieldCheck size={14} /> Historical Simulation — Not Guarantees of Future Returns
        </div>
      </div>

      <div className="grid-3" style={{ gridTemplateColumns: '1fr 2fr' }}>
        {/* Config Panel */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 className="card-title">
            <History size={18} color="var(--accent-cyan)" />
            Historical Grid Sweep
          </h2>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>
              TICKERS (COMMA-SEPARATED)
            </label>
            <input
              type="text"
              value={tickers}
              disabled={isRunning}
              onChange={(e) => setTickers(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>
                START DATE
              </label>
              <input
                type="date"
                value={startDate}
                disabled={isRunning}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  fontFamily: 'var(--font-mono)',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>
                END DATE
              </label>
              <input
                type="date"
                value={endDate}
                disabled={isRunning}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  fontFamily: 'var(--font-mono)',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>
              STEP INTERVAL (DAYS)
            </label>
            <input
              type="number"
              value={interval}
              min="1"
              disabled={isRunning}
              onChange={(e) => setInterval(Math.max(1, Number(e.target.value)))}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>

          {errorMessage && (
            <div style={{ color: 'var(--color-bearish)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <AlertCircle size={14} /> {errorMessage}
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ marginTop: '0.5rem', padding: '0.75rem' }}
            disabled={isRunning}
            onClick={handleRunBacktest}
          >
            {isRunning ? 'Calculating Historical Grid...' : (
              <>
                <Play size={16} /> Run Backtest Sweep
              </>
            )}
          </button>
        </div>

        {/* Results Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {hasRun && backtestResult ? (
            <>
              <div className="grid-3">
                <div className="stat-box">
                  <span className="stat-label">Decision Hit Rate</span>
                  <span className="stat-value" style={{ color: 'var(--color-bullish)' }}>
                    {(backtestResult.hit_rate * 100).toFixed(1)}%
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Alpha &gt; 0 vs. Benchmark SPY
                  </span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">Average Period Alpha</span>
                  <span className="stat-value" style={{ color: 'var(--accent-cyan)' }}>
                    {backtestResult.mean_alpha >= 0 ? '+' : ''}{(backtestResult.mean_alpha * 100).toFixed(2)}%
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Excess Return over Benchmark
                  </span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">Grid Cells Evaluated</span>
                  <span className="stat-value">{backtestResult.cells_count}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Point-in-Time Verified
                  </span>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">
                    <BarChart3 size={18} color="var(--accent-cyan)" />
                    Backtest Calculation Summary
                  </h3>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {backtestResult.notes}
                </p>
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Evaluated Tickers: <strong>{backtestResult.tickers?.join(', ')}</strong> | Period: <strong>{backtestResult.start_date}</strong> to <strong>{backtestResult.end_date}</strong>
                </div>
              </div>
            </>
          ) : (
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              <History size={40} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Ready for Backtesting</h3>
              <p style={{ fontSize: '0.85rem', maxWidth: '400px', lineHeight: 1.5 }}>
                Enter ticker symbols and date range, then click <strong>Run Backtest Sweep</strong> to calculate real historical returns and benchmark alpha.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
