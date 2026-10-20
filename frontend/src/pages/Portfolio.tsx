import React, { useState, useEffect } from 'react';
import { Briefcase, ArrowUpRight, PlusCircle, ShieldCheck, AlertCircle } from 'lucide-react';
import type { PaperPosition, PaperOrder } from '../types';
import { fetchPortfolios, submitPaperOrder } from '../lib/api';

export const Portfolio: React.FC = () => {
  const [portfolioId, setPortfolioId] = useState<string>('');
  const [cash, setCash] = useState<number>(100000.00);
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [orderSymbol, setOrderSymbol] = useState('NVDA');
  const [orderQty, setOrderQty] = useState(10);
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy');

  const totalPositionsValue = positions.reduce(
    (acc, p) => acc + p.quantity * p.currentPrice,
    0
  );
  const totalEquity = cash + totalPositionsValue;
  const totalUnrealizedPnL = positions.reduce((acc, p) => acc + p.unrealizedPnL, 0);

  const loadPortfolio = async () => {
    try {
      const data = await fetchPortfolios();
      setPortfolioId(data.id);
      setCash(data.cash);
      setPositions(data.positions);
      setOrders(data.orders);
    } catch (err: any) {
      console.warn("Could not load portfolio:", err);
    }
  };

  useEffect(() => {
    loadPortfolio();
  }, []);

  const handlePlaceOrder = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await submitPaperOrder(portfolioId, {
        symbol: orderSymbol,
        side: orderSide,
        quantity: orderQty,
        order_type: 'market',
      });
      await loadPortfolio();
    } catch (err: any) {
      setErrorMessage(err.message || 'Order execution failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Paper Portfolio & Ledger</h1>
          <p className="page-subtitle">
            Zero-risk quantitative portfolio execution with exact transaction reconciliation and fee accounting.
          </p>
        </div>
        <div className="status-pill" style={{ background: 'var(--color-bullish-subtle)', color: 'var(--color-bullish)' }}>
          <ShieldCheck size={14} /> Paper Trading Sandbox — No Real Capital at Risk
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid-3">
        <div className="stat-box">
          <span className="stat-label">Total Portfolio Equity</span>
          <span className="stat-value">
            ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="stat-change bullish">
            <ArrowUpRight size={14} /> +${totalUnrealizedPnL.toFixed(2)} Total Unrealized
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Available Free Cash</span>
          <span className="stat-value">
            ${cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Unencumbered Buying Power (USD)
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Holdings Valuation</span>
          <span className="stat-value">
            ${totalPositionsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {positions.length} Active Positions
          </span>
        </div>
      </div>

      {/* Order Entry & Holdings Section */}
      <div className="grid-3" style={{ gridTemplateColumns: '2fr 1fr' }}>
        {/* Positions Table */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <Briefcase size={18} color="var(--accent-cyan)" />
              Current Open Positions
            </h2>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '0.6rem 0.8rem' }}>Symbol</th>
                <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Quantity</th>
                <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Avg Entry</th>
                <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Current Price</th>
                <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Unrealized P&L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const isPos = p.unrealizedPnL >= 0;
                return (
                  <tr key={p.symbol} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '0.8rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      {p.symbol}
                    </td>
                    <td style={{ padding: '0.8rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {p.quantity.toLocaleString()}
                    </td>
                    <td style={{ padding: '0.8rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      ${p.averagePrice.toFixed(2)}
                    </td>
                    <td style={{ padding: '0.8rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      ${p.currentPrice.toFixed(2)}
                    </td>
                    <td
                      style={{
                        padding: '0.8rem',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                        color: isPos ? 'var(--color-bullish)' : 'var(--color-bearish)',
                      }}
                    >
                      {isPos ? '+' : ''}${p.unrealizedPnL.toFixed(2)} ({isPos ? '+' : ''}{p.unrealizedPnLPercent.toFixed(2)}%)
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Paper Trade Form */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 className="card-title">
            <PlusCircle size={18} color="var(--accent-cyan)" />
            Simulate Paper Order
          </h2>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>
              ORDER SIDE
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className={`btn ${orderSide === 'buy' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setOrderSide('buy')}
              >
                BUY
              </button>
              <button
                type="button"
                className={`btn ${orderSide === 'sell' ? 'btn-danger' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setOrderSide('sell')}
              >
                SELL
              </button>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>
              SYMBOL
            </label>
            <input
              type="text"
              value={orderSymbol}
              onChange={(e) => setOrderSymbol(e.target.value.toUpperCase())}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
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
              QUANTITY
            </label>
            <input
              type="number"
              value={orderQty}
              min="1"
              onChange={(e) => setOrderQty(Math.max(1, Number(e.target.value)))}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
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
            style={{ marginTop: 'auto' }}
            disabled={isSubmitting}
            onClick={handlePlaceOrder}
          >
            {isSubmitting ? 'Executing Order...' : 'Submit Paper Order'}
          </button>
        </div>
      </div>

      {/* Order Ledger Table */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header">
          <h2 className="card-title">
            <Briefcase size={18} color="var(--accent-cyan)" />
            Paper Order Execution History
          </h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Reconciled against simulated fills & fees
          </span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '0.6rem 0.8rem' }}>Order ID</th>
              <th style={{ padding: '0.6rem 0.8rem' }}>Symbol</th>
              <th style={{ padding: '0.6rem 0.8rem' }}>Side</th>
              <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Quantity</th>
              <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Price</th>
              <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>Status</th>
              <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No orders placed yet. Use the form above to simulate a paper trade.
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '0.6rem 0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{o.id.slice(0, 8)}</td>
                  <td style={{ padding: '0.6rem 0.8rem', fontWeight: 600 }}>{o.symbol}</td>
                  <td style={{ padding: '0.6rem 0.8rem', textTransform: 'uppercase', color: o.side === 'buy' ? 'var(--color-bullish)' : 'var(--color-bearish)', fontWeight: 600 }}>{o.side}</td>
                  <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{o.quantity}</td>
                  <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>${o.price.toFixed(2)}</td>
                  <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>
                    <span style={{ padding: '0.15rem 0.4rem', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', background: 'rgba(0, 230, 118, 0.15)', color: 'var(--color-bullish)' }}>
                      {o.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', color: 'var(--text-muted)' }}>{o.timestamp?.slice(0, 19).replace('T', ' ')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
