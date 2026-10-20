import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import type { TabId } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './pages/Dashboard';
import { Research } from './pages/Research';
import { Portfolio } from './pages/Portfolio';
import { Backtest } from './pages/Backtest';
import { Alerts } from './pages/Alerts';
import { Admin } from './pages/Admin';
import type { SystemHealth, MarketQuote, AssetType } from './types';
import { fetchSystemHealth, fetchMarketQuotes } from './lib/api';

export function App() {
  const [currentTab, setCurrentTab] = useState<TabId>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicker, setSelectedTicker] = useState('NVDA');
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType>('stock');
  const [canInstall, setCanInstall] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const [health, setHealth] = useState<SystemHealth>({
    status: 'connecting',
    app: 'TradingAgents PWA',
    version: '0.7.0',
    environment: 'development',
    liveTradingEnabled: false,
    sandboxMode: true,
    defaultAiProvider: 'google',
    uptimeSeconds: 0,
  });

  const [quotes, setQuotes] = useState<MarketQuote[]>([]);

  useEffect(() => {
    // Poll system health and quotes
    const loadData = async () => {
      const h = await fetchSystemHealth();
      setHealth(h);
      const q = await fetchMarketQuotes();
      setQuotes(q);
    };

    loadData();
    const interval = setInterval(loadData, 15000);

    // Listen for PWA install event
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setCanInstall(false);
    }
    setDeferredPrompt(null);
  };

  const handleSelectTickerForResearch = (symbol: string, assetType: AssetType) => {
    setSelectedTicker(symbol);
    setSelectedAssetType(assetType);
    setCurrentTab('research');
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        health={health}
      />

      {/* Main Workspace Area */}
      <div className="main-content">
        <Header
          health={health}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          canInstall={canInstall}
          onInstallClick={handleInstallClick}
        />

        {/* Tab Router */}
        {currentTab === 'dashboard' && (
          <Dashboard
            quotes={quotes}
            onSelectTickerForResearch={handleSelectTickerForResearch}
          />
        )}

        {currentTab === 'research' && (
          <Research
            initialSymbol={selectedTicker}
            initialAssetType={selectedAssetType}
          />
        )}

        {currentTab === 'portfolio' && <Portfolio />}

        {currentTab === 'backtest' && <Backtest />}

        {currentTab === 'alerts' && <Alerts />}

        {currentTab === 'admin' && <Admin health={health} />}
      </div>
    </div>
  );
}

export default App;
