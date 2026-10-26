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
import { Login } from './pages/Login';
import { LoadingScreen } from './components/LoadingScreen';
import { ConfigError } from './components/ConfigError';
import { AuthProvider, useAuth } from './context/AuthContext';
import type { SystemHealth, MarketQuote, AssetType } from './types';
import { fetchSystemHealth, fetchMarketQuotes } from './lib/api';

function AppContent() {
  const { user, loading, isConfigured } = useAuth();
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

  // PWA install handler (independent of authentication)
  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  // Poll system health and quotes ONLY when authenticated
  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    const loadData = async () => {
      try {
        const h = await fetchSystemHealth();
        if (isMounted) setHealth(h);
        const q = await fetchMarketQuotes();
        if (isMounted) setQuotes(q);
      } catch {
        // Handled within api fetchers
      }
    };

    loadData();
    const interval = setInterval(loadData, 15000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user]);

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

  // 1. Loading state during initial session restoration (prevents flashing private content)
  if (loading) {
    return <LoadingScreen />;
  }

  // 2. Fail-closed error if Supabase credentials are missing in production
  if (!isConfigured && import.meta.env.PROD) {
    return <ConfigError />;
  }

  // 3. Unauthenticated state: display full-page Login / Register screen
  if (!user) {
    return <Login />;
  }

  // 4. Authenticated state: verify tab permissions
  const effectiveTab = currentTab === 'admin' && user.role !== 'admin' ? 'dashboard' : currentTab;

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={effectiveTab}
        onSelectTab={(tab) => {
          if (tab === 'admin' && user.role !== 'admin') {
            return;
          }
          setCurrentTab(tab);
        }}
        health={health}
        userRole={user.role}
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

        {/* Protected Tab Router */}
        {effectiveTab === 'dashboard' && (
          <Dashboard
            quotes={quotes}
            onSelectTickerForResearch={handleSelectTickerForResearch}
          />
        )}

        {effectiveTab === 'research' && (
          <Research
            initialSymbol={selectedTicker}
            initialAssetType={selectedAssetType}
          />
        )}

        {effectiveTab === 'portfolio' && <Portfolio />}

        {effectiveTab === 'backtest' && <Backtest />}

        {effectiveTab === 'alerts' && <Alerts />}

        {effectiveTab === 'admin' && user.role === 'admin' && <Admin health={health} />}
      </div>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
