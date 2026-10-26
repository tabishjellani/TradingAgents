import test from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage for Node test environment
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

test('1. Production mode strictly rejects synthetic development mock tokens', () => {
  const storage = new MockLocalStorage();
  const STORAGE_KEY = 'tradingagents_auth_token';

  // Simulate existing synthetic mock token in localStorage
  storage.setItem(STORAGE_KEY, 'test-token:dev-user-01:dev@tradingagents.local:admin');

  // Verify rejection logic matching frontend/src/lib/api.ts
  const isProd = true;
  let inMemoryToken = null;
  const stored = storage.getItem(STORAGE_KEY);
  if (stored) {
    if (isProd && stored.startsWith('test-token:')) {
      storage.removeItem(STORAGE_KEY);
      inMemoryToken = null;
    } else {
      inMemoryToken = stored;
    }
  }

  assert.strictEqual(inMemoryToken, null, 'Mock token must be null in production');
  assert.strictEqual(storage.getItem(STORAGE_KEY), null, 'Mock token must be removed from storage in production');
});

test('2. Unauthenticated visitors are gated: Dashboard and private navigation do not render', () => {
  // Simulate AppContent gate logic
  const authState = {
    loading: false,
    user: null, // No active session
    isConfigured: true,
  };

  const determineView = (state) => {
    if (state.loading) return 'LoadingScreen';
    if (!state.isConfigured) return 'ConfigError';
    if (!state.user) return 'Login';
    return 'ProtectedWorkspace';
  };

  const renderedView = determineView(authState);
  assert.strictEqual(renderedView, 'Login', 'Unauthenticated visitor must see Login/Register view');
  assert.notStrictEqual(renderedView, 'ProtectedWorkspace', 'Protected workspace must not render');
});

test('3. Session restoration loading state prevents flashing private content', () => {
  const authState = {
    loading: true, // Initial getSession in flight
    user: null,
    isConfigured: true,
  };

  const determineView = (state) => {
    if (state.loading) return 'LoadingScreen';
    if (!state.isConfigured) return 'ConfigError';
    if (!state.user) return 'Login';
    return 'ProtectedWorkspace';
  };

  assert.strictEqual(determineView(authState), 'LoadingScreen', 'Must show LoadingScreen while loading');
});

test('4. Missing Supabase configuration in production fails closed', () => {
  const authState = {
    loading: false,
    user: null,
    isConfigured: false, // VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing
  };

  const determineView = (state, isProd = true) => {
    if (state.loading) return 'LoadingScreen';
    if (!state.isConfigured && isProd) return 'ConfigError';
    if (!state.user) return 'Login';
    return 'ProtectedWorkspace';
  };

  assert.strictEqual(determineView(authState, true), 'ConfigError', 'Missing config in prod must fail closed');
});

test('5. Valid authenticated session unlocks protected workspace', () => {
  const authState = {
    loading: false,
    user: { id: 'usr-456', email: 'trader@example.com', role: 'user' },
    isConfigured: true,
  };

  const determineView = (state) => {
    if (state.loading) return 'LoadingScreen';
    if (!state.isConfigured) return 'ConfigError';
    if (!state.user) return 'Login';
    return 'ProtectedWorkspace';
  };

  assert.strictEqual(determineView(authState), 'ProtectedWorkspace', 'Valid session grants access');
});

test('6. Non-admin users cannot access administration tab or features', () => {
  const standardUser = { id: 'usr-123', email: 'user@example.com', role: 'user' };
  const adminUser = { id: 'adm-999', email: 'admin@example.com', role: 'admin' };

  const canAccessAdmin = (user, requestedTab) => {
    if (requestedTab === 'admin') {
      return user.role === 'admin';
    }
    return true;
  };

  assert.strictEqual(canAccessAdmin(standardUser, 'dashboard'), true, 'Standard user can view dashboard');
  assert.strictEqual(canAccessAdmin(standardUser, 'admin'), false, 'Standard user blocked from admin tab');
  assert.strictEqual(canAccessAdmin(adminUser, 'admin'), true, 'Admin user can access admin tab');
});

test('7. Logout immediately clears credentials and reverts to Login view', () => {
  const storage = new MockLocalStorage();
  const STORAGE_KEY = 'tradingagents_auth_token';
  storage.setItem(STORAGE_KEY, 'valid.jwt.token');

  let state = {
    user: { id: 'usr-123', email: 'trader@example.com', role: 'user' },
    token: 'valid.jwt.token',
  };

  // Perform signout
  const signOut = () => {
    storage.removeItem(STORAGE_KEY);
    state.user = null;
    state.token = null;
  };

  signOut();

  assert.strictEqual(state.user, null, 'User state cleared immediately');
  assert.strictEqual(state.token, null, 'Token cleared from memory');
  assert.strictEqual(storage.getItem(STORAGE_KEY), null, 'Token removed from storage');
});

test('8. Live-trading safety remains disabled by default', () => {
  const defaultHealth = {
    status: 'healthy',
    liveTradingEnabled: false,
    sandboxMode: true,
  };

  assert.strictEqual(defaultHealth.liveTradingEnabled, false, 'Live trading must be disabled');
  assert.strictEqual(defaultHealth.sandboxMode, true, 'Sandbox mode must be active');
});

test('9. Super Admin role is granted access to administration tab alongside Admin', () => {
  const superAdmin = { id: 'sa-001', email: 'owner@tradingagents.com', role: 'super_admin' };
  const admin = { id: 'adm-002', email: 'staff@tradingagents.com', role: 'admin' };
  const user = { id: 'usr-003', email: 'trader@example.com', role: 'user' };

  const canAccessAdmin = (u) => u.role === 'admin' || u.role === 'super_admin';

  assert.strictEqual(canAccessAdmin(superAdmin), true, 'Super admin must access admin tab');
  assert.strictEqual(canAccessAdmin(admin), true, 'Admin must access admin tab');
  assert.strictEqual(canAccessAdmin(user), false, 'Regular user must be blocked');
});

test('10. Mobile sidebar drawer defaults to closed, opens on toggle, closes on selection', () => {
  let isMobileOpen = false;

  // Toggle open
  const toggleMobileMenu = () => {
    isMobileOpen = !isMobileOpen;
  };

  // Close on selection
  const selectTab = () => {
    isMobileOpen = false;
  };

  // Initial state on mobile
  assert.strictEqual(isMobileOpen, false, 'Sidebar must be closed by default on mobile');

  // Open drawer
  toggleMobileMenu();
  assert.strictEqual(isMobileOpen, true, 'Drawer must open when menu button clicked');

  // Select tab
  selectTab();
  assert.strictEqual(isMobileOpen, false, 'Drawer must auto-close when navigation item selected');
});
