import type { MarketQuote, ResearchJob, SystemHealth, PaperPosition, PaperOrder, AlertRule } from '../types';

const API_BASE = '/api/v1';

// Token storage: checks localStorage first, defaults to offline dev admin token if unauthenticated
const STORAGE_KEY = 'tradingagents_auth_token';

let inMemoryToken: string | null = localStorage.getItem(STORAGE_KEY);
if (!inMemoryToken && !import.meta.env.PROD) {
  // Local offline development convenience only; impossible in production builds
  inMemoryToken = 'test-token:dev-user-01:dev@tradingagents.local:admin';
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export function setAuthToken(token: string | null) {
  inMemoryToken = token;
  if (token) {
    localStorage.setItem(STORAGE_KEY, token);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
}

export async function fetchSystemHealth(): Promise<SystemHealth> {
  try {
    const res = await apiFetch('/health');
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

export async function fetchMarketQuotes(symbols: string = 'SPY,QQQ,NVDA,AAPL,BTC-USD,ETH-USD'): Promise<MarketQuote[]> {
  try {
    const res = await apiFetch(`/market/quotes?symbols=${encodeURIComponent(symbols)}`);
    if (res.ok) {
      const data = await res.json();
      return data.map((q: any) => ({
        symbol: q.symbol,
        name: q.name,
        assetType: q.assetType || q.asset_type || 'stock',
        price: Number(q.price),
        change: Number(q.change),
        changePercent: Number(q.changePercent ?? q.change_percent ?? 0),
        volume: Number(q.volume),
        high24h: Number(q.high24h ?? q.high_24h ?? q.price),
        low24h: Number(q.low24h ?? q.low_24h ?? q.price),
        source: q.source || 'Yahoo Finance',
        timestamp: q.timestamp,
        isDelayed: Boolean(q.isDelayed ?? q.is_delayed),
      }));
    }
  } catch {
    // Fall back to snapshot if backend is starting up
  }

  return [];
}

export async function submitResearchJob(params: {
  symbol: string;
  asset_type?: 'stock' | 'crypto';
  trade_date: string;
  analysts: string[];
  config_overrides?: Record<string, any>;
}): Promise<ResearchJob> {
  const res = await apiFetch('/research/jobs', {
    method: 'POST',
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to submit research job: HTTP ${res.status}`);
  }

  const data = await res.json();
  return {
    id: data.id,
    symbol: data.symbol,
    assetType: data.asset_type,
    tradeDate: data.trade_date,
    status: data.status,
    currentStep: data.current_step,
    progressPercent: data.progress_percent,
    createdAt: data.created_at,
    completedAt: data.completed_at,
  };
}

export async function getResearchJob(jobId: string): Promise<any> {
  const res = await apiFetch(`/research/jobs/${jobId}`);
  if (!res.ok) {
    throw new Error(`Failed to get research job: HTTP ${res.status}`);
  }
  return await res.json();
}

export async function getJobReport(jobId: string, format: 'json' | 'markdown' = 'json'): Promise<any> {
  const res = await apiFetch(`/research/jobs/${jobId}/report?format=${format}`);
  if (!res.ok) {
    throw new Error(`Report not available: HTTP ${res.status}`);
  }
  return await res.json();
}

export async function cancelResearchJob(jobId: string): Promise<boolean> {
  const res = await apiFetch(`/research/jobs/${jobId}/cancel`, { method: 'POST' });
  return res.ok;
}

export async function fetchPortfolios(): Promise<{ id: string; cash: number; positions: PaperPosition[]; orders: PaperOrder[] }> {
  const res = await apiFetch('/portfolios');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const primary = data[0] || {};
  
  const positions: PaperPosition[] = Object.values(primary.positions || {}).map((p: any) => ({
    symbol: p.symbol,
    assetType: p.asset_type || 'stock',
    quantity: Number(p.quantity),
    averagePrice: Number(p.average_price),
    currentPrice: Number(p.average_price), // Will be updated by live quote
    unrealizedPnL: Number(p.realized_pnl || 0),
    unrealizedPnLPercent: 0,
  }));

  const orders: PaperOrder[] = (primary.orders || []).map((o: any) => ({
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    orderType: o.order_type,
    quantity: Number(o.quantity),
    price: Number(o.price),
    status: o.status,
    timestamp: o.created_at,
    fees: Number(o.fees),
  }));

  return {
    id: primary.id,
    cash: Number(primary.current_cash ?? 100000.0),
    positions,
    orders,
  };
}

export async function submitPaperOrder(portfolioId: string, orderReq: {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  order_type?: 'market' | 'limit';
}): Promise<PaperOrder> {
  const res = await apiFetch(`/portfolios/${portfolioId}/orders`, {
    method: 'POST',
    body: JSON.stringify({
      symbol: orderReq.symbol,
      side: orderReq.side,
      quantity: orderReq.quantity,
      order_type: orderReq.order_type || 'market',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Order failed: HTTP ${res.status}`);
  }

  const o = await res.json();
  return {
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    orderType: o.order_type,
    quantity: Number(o.quantity),
    price: Number(o.price),
    status: o.status,
    timestamp: o.created_at,
    fees: Number(o.fees),
  };
}

export async function runBacktest(params: {
  tickers: string[];
  start_date: string;
  end_date: string;
  every_n_days: number;
}): Promise<any> {
  const res = await apiFetch('/backtest/run', {
    method: 'POST',
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Backtest failed: HTTP ${res.status}`);
  }

  return await res.json();
}

export async function fetchAlertRules(): Promise<AlertRule[]> {
  const res = await apiFetch('/alerts/rules');
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((a: any) => ({
    id: a.id,
    symbol: a.symbol,
    condition: a.condition,
    threshold: Number(a.threshold),
    isActive: Boolean(a.is_active),
    cooldownMinutes: Number(a.cooldown_minutes),
    lastTriggered: a.last_triggered_at,
  }));
}

export async function createAlertRule(rule: {
  symbol: string;
  condition: string;
  threshold: number;
  cooldown_minutes?: number;
}): Promise<AlertRule> {
  const res = await apiFetch('/alerts/rules', {
    method: 'POST',
    body: JSON.stringify(rule),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Alert creation failed: HTTP ${res.status}`);
  }

  const a = await res.json();
  return {
    id: a.id,
    symbol: a.symbol,
    condition: a.condition,
    threshold: Number(a.threshold),
    isActive: Boolean(a.is_active),
    cooldownMinutes: Number(a.cooldown_minutes),
    lastTriggered: a.last_triggered_at,
  };
}

export async function deleteAlertRule(ruleId: string): Promise<boolean> {
  const res = await apiFetch(`/alerts/rules/${ruleId}`, { method: 'DELETE' });
  return res.ok;
}

export async function fetchAdminTelemetry(): Promise<any> {
  const res = await apiFetch('/admin/telemetry');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export async function triggerKillSwitch(action: 'activate' | 'deactivate', reason: string = 'Operator command'): Promise<any> {
  const res = await apiFetch('/trading/kill-switch', {
    method: 'POST',
    body: JSON.stringify({ action, reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Kill switch action failed: HTTP ${res.status}`);
  }
  return await res.json();
}
