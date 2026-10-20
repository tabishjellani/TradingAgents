export type AssetType = 'stock' | 'crypto';

export type PortfolioRating = 'Buy' | 'Overweight' | 'Hold' | 'Underweight' | 'Sell' | 'REVIEW';

export interface MarketQuote {
  symbol: string;
  name: string;
  assetType: AssetType;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high24h: number;
  low24h: number;
  source: string;
  timestamp: string;
  isDelayed: boolean;
}

export interface ResearchJob {
  id: string;
  symbol: string;
  assetType: AssetType;
  tradeDate: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStep?: string;
  rating?: PortfolioRating;
  progressPercent: number;
  createdAt: string;
  completedAt?: string;
  summary?: string;
}

export interface PaperPosition {
  symbol: string;
  assetType: AssetType;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
}

export interface PaperOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  orderType: 'market' | 'limit';
  quantity: number;
  price: number;
  status: 'filled' | 'pending' | 'cancelled';
  timestamp: string;
  fees: number;
}

export interface AlertRule {
  id: string;
  symbol: string;
  condition: 'above' | 'below' | 'pct_change';
  threshold: number;
  isActive: boolean;
  cooldownMinutes: number;
  lastTriggered?: string;
}

export interface SystemHealth {
  status: string;
  app: string;
  version: string;
  environment: string;
  liveTradingEnabled: boolean;
  sandboxMode: boolean;
  defaultAiProvider: string;
  uptimeSeconds: number;
}
