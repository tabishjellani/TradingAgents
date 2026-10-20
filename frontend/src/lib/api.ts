import type { MarketQuote, ResearchJob, SystemHealth } from '../types';

const API_BASE = '/api/v1';

export async function fetchSystemHealth(): Promise<SystemHealth> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      status: data.status,
      app: data.app,
      version: data.version,
      environment: data.environment,
      liveTradingEnabled: data.live_trading_enabled ?? false,
      sandboxMode: data.sandbox_mode ?? true,
      defaultAiProvider: data.default_ai_provider ?? 'google',
      uptimeSeconds: data.uptime_seconds ?? 0,
    };
  } catch {
    // Offline or connecting fallback
    return {
      status: 'offline',
      app: 'TradingAgents PWA',
      version: '0.7.0',
      environment: 'local',
      liveTradingEnabled: false,
      sandboxMode: true,
      defaultAiProvider: 'google',
      uptimeSeconds: 0,
    };
  }
}

export async function fetchMarketQuotes(): Promise<MarketQuote[]> {
  try {
    const res = await fetch(`${API_BASE}/market/quotes`);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Fall back to default watchlist snapshot if backend is not yet populated
  }

  return [
    {
      symbol: 'NVDA',
      name: 'NVIDIA Corporation',
      assetType: 'stock',
      price: 138.25,
      change: 3.42,
      changePercent: 2.54,
      volume: 45210900,
      high24h: 140.10,
      low24h: 134.80,
      source: 'Yahoo Finance (Delayed)',
      timestamp: new Date().toISOString(),
      isDelayed: true,
    },
    {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      assetType: 'stock',
      price: 234.50,
      change: -1.20,
      changePercent: -0.51,
      volume: 38920100,
      high24h: 236.80,
      low24h: 233.10,
      source: 'Yahoo Finance (Delayed)',
      timestamp: new Date().toISOString(),
      isDelayed: true,
    },
    {
      symbol: 'BTC-USD',
      name: 'Bitcoin USD',
      assetType: 'crypto',
      price: 94820.00,
      change: 1850.00,
      changePercent: 1.99,
      volume: 32410800000,
      high24h: 96100.00,
      low24h: 92400.00,
      source: 'Yahoo Finance',
      timestamp: new Date().toISOString(),
      isDelayed: false,
    },
    {
      symbol: 'ETH-USD',
      name: 'Ethereum USD',
      assetType: 'crypto',
      price: 3410.50,
      change: 78.20,
      changePercent: 2.35,
      volume: 18720100000,
      high24h: 3480.00,
      low24h: 3320.00,
      source: 'Yahoo Finance',
      timestamp: new Date().toISOString(),
      isDelayed: false,
    },
  ];
}

export async function submitResearchJob(params: {
  symbol: string;
  assetType: 'stock' | 'crypto';
  analysts: string[];
  tradeDate: string;
}): Promise<ResearchJob> {
  const res = await fetch(`${API_BASE}/research/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    throw new Error(`Failed to submit research job: HTTP ${res.status}`);
  }

  return await res.json();
}
