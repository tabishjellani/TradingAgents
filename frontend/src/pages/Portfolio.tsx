import React, { useState } from 'react';
import { Briefcase, ArrowUpRight, PlusCircle, ShieldCheck } from 'lucide-react';
import type { PaperPosition, PaperOrder } from '../types';

export const Portfolio: React.FC = () => {
  const [cash, setCash] = useState<number>(45250.00);
  const [positions] = useState<PaperPosition[]>([
    {
      symbol: 'NVDA',
      assetType: 'stock',
      quantity: 150,
      averagePrice: 124.50,
      currentPrice: 138.25,
      unrealizedPnL: 2062.50,
      unrealizedPnLPercent: 11.04,
    },
    {
      symbol: 'AAPL',
      assetType: 'stock',
      quantity: 80,
      averagePrice: 228.00,
      currentPrice: 234.50,
      unrealizedPnL: 520.00,
      unrealizedPnLPercent: 2.85,
    },
    {
      symbol: 'BTC-USD',
      assetType: 'crypto',
      quantity: 0.35,
      averagePrice: 91200.00,
      currentPrice: 94820.00,
      unrealizedPnL: 1267.00,
      unrealizedPnLPercent: 3.97,
    },
  ]);

  const [orders, setOrders] = useState<PaperOrder[]>([
    {
      id: 'ord-101',
      symbol: 'NVDA',
      side: 'buy',
      orderType: 'market',
      quantity: 50,
      price: 138.25,
      status: 'filled',
      timestamp: '2026-10-20 14:32:00',
      fees: 0.00,
    },
  ]);

  const [orderSymbol, setOrderSymbol] = useState('NVDA');
  const [orderQty, setOrderQty] = useState(10);
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy');

  const totalPositionsValue = positions.reduce(
    (acc, p) => acc + p.quantity * p.currentPrice,
    0
  );
  const totalEquity = cash + totalPositionsValue;
  const totalUnrealizedPnL = positions.reduce((acc, p) => acc + p.unrealizedPnL, 0);

  const handlePlaceOrder = () => {
    const price = orderSymbol === 'BTC-USD' ? 94820.00 : 138.25;
    const cost = price * orderQty;

    if (orderSide === 'buy' && cost > cash) {
      alert('Insufficient paper cash for this order.');
      return;
    }

    const newOrder: PaperOrder = {
      id: `ord-${Date.now().toString().slice(-4)}`,
      symbol: orderSymbol,
      side: orderSide,
      orderType: 'market',
      quantity: orderQty,
      price,
      status: 'filled',
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      fees: 0.00,
    };

    setOrders([newOrder, ...orders]);
    if (orderSide === 'buy') {
      setCash((prev) => prev - cost);
    } else {
      setCash((prev) => prev + cost);
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

          <button className="btn btn-primary" style={{ marginTop: 'auto' }} onClick={handlePlaceOrder}>
            Submit Paper Order
          </button>
        </div>
      </div>
    </div>
  );
};
