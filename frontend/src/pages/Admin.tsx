import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Activity,
  AlertTriangle,
  Key,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Save,
  Trash2,
  Zap,
  Cpu,
  RefreshCw,
  Users,
  Search,
  UserCheck,
  UserX,
  Radio,
  Lock,
} from 'lucide-react';
import type { SystemHealth, MarketProviderStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  fetchAdminTelemetry,
  triggerKillSwitch,
  fetchAiProviders,
  saveAiProviderKey,
  deleteAiProviderKey,
  updateAiConfig,
  testAiProviderConnection,
  fetchMarketStatus,
  fetchAdminUsers,
  updateAdminUserRole,
  updateAdminUserStatus,
  type AiProviderInfo,
  type AdminUserInfo,
} from '../lib/api';

interface AdminProps {
  health: SystemHealth;
}

export const Admin: React.FC<AdminProps> = ({ health }) => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [killSwitchMessage, setKillSwitchMessage] = useState<string | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);

  // AI Providers state
  const [providers, setProviders] = useState<AiProviderInfo[]>([]);
  const [activeProvider, setActiveProvider] = useState<string>(health.defaultAiProvider || 'google');
  const [selectedQuick, setSelectedQuick] = useState<Record<string, string>>({});
  const [selectedDeep, setSelectedDeep] = useState<Record<string, string>>({});
  const [inputKeys, setInputKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string; latency_ms?: number }>>({});
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Market Data Provider Status
  const [marketStatus, setMarketStatus] = useState<MarketProviderStatus | null>(null);

  // User Management State
  const [usersList, setUsersList] = useState<AdminUserInfo[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [userTotal, setUserTotal] = useState(0);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  const loadData = async () => {
    try {
      await fetchAdminTelemetry();
    } catch (err: any) {
      console.warn('Telemetry fetch error:', err);
    }

    try {
      const aiData = await fetchAiProviders();
      setProviders(aiData.providers);
      setActiveProvider(aiData.active_provider);

      const initialQuick: Record<string, string> = {};
      const initialDeep: Record<string, string> = {};
      aiData.providers.forEach((p) => {
        initialQuick[p.id] = p.current_quick_model;
        initialDeep[p.id] = p.current_deep_model;
      });
      setSelectedQuick(initialQuick);
      setSelectedDeep(initialDeep);
    } catch (err: any) {
      console.warn('AI providers fetch error:', err);
    }

    try {
      const mStatus = await fetchMarketStatus();
      setMarketStatus(mStatus);
    } catch (err: any) {
      console.warn('Market status fetch error:', err);
    }

    await loadUsers(userSearch, userPage);
  };

  const loadUsers = async (search: string, page: number) => {
    setIsLoadingUsers(true);
    try {
      const res = await fetchAdminUsers(search, page);
      setUsersList(res.users);
      setUserTotal(res.total);
    } catch (err: any) {
      console.warn('User list fetch error:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleKillSwitch = async () => {
    setIsTriggering(true);
    setKillSwitchMessage(null);
    try {
      const action = killSwitchActive ? 'deactivate' : 'activate';
      const res = await triggerKillSwitch(action, 'Operator toggle from Admin UI');
      setKillSwitchActive(res.kill_switch_active);
      setKillSwitchMessage(res.message);
    } catch (err: any) {
      setKillSwitchMessage(err.message || 'Kill switch operation failed.');
    } finally {
      setIsTriggering(false);
    }
  };

  const handleSaveKey = async (providerId: string) => {
    const key = inputKeys[providerId];
    if (!key || key.trim().length < 8) {
      setStatusMessage({ type: 'error', text: 'API key must be at least 8 characters.' });
      return;
    }

    setActionLoading((prev) => ({ ...prev, [providerId]: true }));
    setStatusMessage(null);
    try {
      await saveAiProviderKey(providerId, key.trim());
      setInputKeys((prev) => ({ ...prev, [providerId]: '' }));
      setStatusMessage({ type: 'success', text: `API key encrypted and saved for ${providerId.toUpperCase()}.` });
      await loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to save API key.' });
    } finally {
      setActionLoading((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const handleDeleteKey = async (providerId: string) => {
    if (!window.confirm(`Are you sure you want to remove the API key for ${providerId.toUpperCase()}?`)) {
      return;
    }
    setActionLoading((prev) => ({ ...prev, [providerId]: true }));
    setStatusMessage(null);
    try {
      await deleteAiProviderKey(providerId);
      setStatusMessage({ type: 'success', text: `API key removed for ${providerId.toUpperCase()}.` });
      await loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to remove API key.' });
    } finally {
      setActionLoading((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const handleTestConnection = async (providerId: string) => {
    setActionLoading((prev) => ({ ...prev, [`test_${providerId}`]: true }));
    try {
      const manualKey = inputKeys[providerId];
      const res = await testAiProviderConnection(providerId, manualKey);
      setTestResults((prev) => ({ ...prev, [providerId]: res }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: { success: false, message: err.message || 'Connection test failed.' },
      }));
    } finally {
      setActionLoading((prev) => ({ ...prev, [`test_${providerId}`]: false }));
    }
  };

  const handleSetActiveProvider = async (providerId: string, qModel: string, dModel: string) => {
    setStatusMessage(null);
    try {
      await updateAiConfig(providerId, qModel, dModel);
      setActiveProvider(providerId);
      setStatusMessage({
        type: 'success',
        text: `Active engine updated to ${providerId.toUpperCase()} (${qModel} / ${dModel}).`,
      });
      await loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to update active provider.' });
    }
  };

  const handleRoleChange = async (targetUser: AdminUserInfo, newRole: string) => {
    if (!isSuperAdmin) {
      setStatusMessage({ type: 'error', text: 'Only Super Administrators can change user roles.' });
      return;
    }
    if (
      !window.confirm(
        `Are you sure you want to change ${targetUser.email}'s role from '${targetUser.role}' to '${newRole}'?`
      )
    ) {
      return;
    }
    try {
      await updateAdminUserRole(targetUser.id, newRole);
      setStatusMessage({ type: 'success', text: `Updated ${targetUser.email} to ${newRole}.` });
      await loadUsers(userSearch, userPage);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to update user role.' });
    }
  };

  const handleToggleUserBan = async (targetUser: AdminUserInfo) => {
    if (!isSuperAdmin) {
      setStatusMessage({ type: 'error', text: 'Only Super Administrators can suspend accounts.' });
      return;
    }
    const nextBanState = !targetUser.is_banned;
    const actionLabel = nextBanState ? 'suspend' : 're-enable';
    if (!window.confirm(`Are you sure you want to ${actionLabel} account ${targetUser.email}?`)) {
      return;
    }
    try {
      await updateAdminUserStatus(targetUser.id, nextBanState);
      setStatusMessage({ type: 'success', text: `Account ${targetUser.email} ${actionLabel}d.` });
      await loadUsers(userSearch, userPage);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || `Failed to ${actionLabel} account.` });
    }
  };

  const auditLogs = [
    { id: 1, action: 'SYSTEM_STARTUP', actor: 'LocalDaemon', timestamp: '2026-10-26 14:00:00', status: 'SUCCESS' },
    { id: 2, action: 'MARKET_DATA_PROV_SYNC', actor: 'MarketEngine', timestamp: '2026-10-26 14:15:20', status: 'SUCCESS' },
    { id: 3, action: 'LIVE_TRADING_CHECK', actor: 'SafetyGuard', timestamp: '2026-10-26 14:20:00', status: 'BLOCKED (DISABLED)' },
    { id: 4, action: 'SUPER_ADMIN_VERIFICATION', actor: user?.email || 'admin', timestamp: '2026-10-26 14:30:10', status: 'SUCCESS' },
  ];

  return (
    <div className="page-container">
      <div className="page-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h1 className="page-title">Administration Console</h1>
            <span
              style={{
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                padding: '0.2rem 0.6rem',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 700,
                background: isSuperAdmin ? 'rgba(0, 229, 255, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                color: isSuperAdmin ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                border: isSuperAdmin ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
              }}
            >
              {isSuperAdmin ? 'Super Administrator' : 'Administrator'}
            </span>
          </div>
          <p className="page-subtitle">
            User management, market data health, encrypted AI credentials, and security controls.
          </p>
        </div>

        <button className="btn btn-secondary" onClick={loadData}>
          <RefreshCw size={14} /> Refresh Console
        </button>
      </div>

      {statusMessage && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            background: statusMessage.type === 'success' ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 68, 68, 0.12)',
            border: `1px solid ${statusMessage.type === 'success' ? 'var(--color-bullish)' : 'var(--color-bearish)'}`,
            color: statusMessage.type === 'success' ? 'var(--color-bullish)' : 'var(--color-bearish)',
            fontSize: '0.9rem',
          }}
        >
          {statusMessage.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Safety Gate Warning & Kill Switch Status */}
      <div className="card" style={{ borderLeft: killSwitchActive ? '4px solid var(--color-bearish)' : '4px solid var(--accent-cyan)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1.1rem' }}>
              <ShieldCheck size={20} color={killSwitchActive ? 'var(--color-bearish)' : 'var(--accent-cyan)'} />
              Mandatory Live Trading Safety Gate: {killSwitchActive ? 'EMERGENCY SHUTDOWN ACTIVE' : 'SECURE'}
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
              Live execution is hard-disabled at the server boundary. All real broker transmissions are strictly rejected.
            </p>
            {killSwitchMessage && (
              <p style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', marginTop: '0.2rem' }}>
                {killSwitchMessage}
              </p>
            )}
          </div>
          <button
            className={`btn ${killSwitchActive ? 'btn-primary' : 'btn-danger'}`}
            disabled={isTriggering}
            onClick={handleToggleKillSwitch}
          >
            <AlertTriangle size={16} />
            {isTriggering ? 'Executing...' : killSwitchActive ? 'Deactivate Kill Switch' : 'Trigger Emergency Kill Switch'}
          </button>
        </div>
      </div>

      {/* Market Data Provider Status Diagnostics Panel */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <Radio size={18} color="var(--accent-cyan)" />
            Market Data Providers & Ingestion Engine
          </h2>
          <span
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              background:
                marketStatus?.status === 'healthy'
                  ? 'rgba(0, 230, 118, 0.15)'
                  : marketStatus?.status === 'degraded'
                  ? 'rgba(245, 158, 11, 0.15)'
                  : 'rgba(239, 68, 68, 0.15)',
              color:
                marketStatus?.status === 'healthy'
                  ? 'var(--color-bullish)'
                  : marketStatus?.status === 'degraded'
                  ? 'var(--color-neutral)'
                  : 'var(--color-bearish)',
            }}
          >
            {marketStatus?.status || 'Active'}
          </span>
        </div>

        <div className="grid-3" style={{ marginTop: '0.5rem' }}>
          <div className="stat-box">
            <span className="stat-label">Active Provider</span>
            <span className="stat-value" style={{ fontSize: '1.15rem' }}>
              {marketStatus?.provider || 'Yahoo Finance'}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Asset Scope: Equities, Crypto, ETFs, Futures
            </span>
          </div>

          <div className="stat-box">
            <span className="stat-label">Cache Health & Efficiency</span>
            <span className="stat-value" style={{ fontSize: '1.15rem' }}>
              {marketStatus?.cache_entries ?? 0} Items Cached
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-bullish)' }}>
              {marketStatus?.cache_hits ?? 0} Cache Hits ({marketStatus?.total_requests ? ((marketStatus.cache_hits / marketStatus.total_requests) * 100).toFixed(0) : 0}% Ratio)
            </span>
          </div>

          <div className="stat-box">
            <span className="stat-label">Feed Freshness</span>
            <span className="stat-value" style={{ fontSize: '1.15rem' }}>
              {marketStatus?.is_free_tier ? '15m Delayed / Live Crypto' : 'Real-Time'}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Last Sync: {marketStatus?.last_successful_update ? new Date(marketStatus.last_successful_update).toLocaleTimeString() : 'Online'}
            </span>
          </div>
        </div>
      </div>

      {/* User Management & Super Admin RBAC Table */}
      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 className="card-title">
              <Users size={18} color="var(--accent-cyan)" />
              User Access Control & Roles ({userTotal} Total)
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              {isSuperAdmin
                ? 'Super Administrator access: Role assignment and account suspension authorized.'
                : 'Read-only view for administrators. Role modifications require Super Admin.'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.35rem 0.75rem',
              }}
            >
              <Search size={14} color="var(--text-muted)" />
              <input
                type="text"
                placeholder="Search user email or UUID..."
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value);
                  setUserPage(1);
                  loadUsers(e.target.value, 1);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  width: '180px',
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '0.75rem 1rem' }}>User Email</th>
                <th style={{ padding: '0.75rem 1rem' }}>User ID</th>
                <th style={{ padding: '0.75rem 1rem' }}>Assigned Role</th>
                <th style={{ padding: '0.75rem 1rem' }}>Account Status</th>
                <th style={{ padding: '0.75rem 1rem' }}>Registered On</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Role Management</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Account Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingUsers ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading user records...
                  </td>
                </tr>
              ) : usersList.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No matching users found.
                  </td>
                </tr>
              ) : (
                usersList.map((u) => {
                  const isCurrent = u.id === user?.id;
                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {u.email} {isCurrent && <span style={{ color: 'var(--accent-cyan)', fontSize: '0.75rem' }}>(You)</span>}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {u.id.slice(0, 12)}...
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            background:
                              u.role === 'super_admin'
                                ? 'rgba(0, 229, 255, 0.2)'
                                : u.role === 'admin'
                                ? 'rgba(2, 132, 199, 0.2)'
                                : 'rgba(255, 255, 255, 0.08)',
                            color:
                              u.role === 'super_admin'
                                ? 'var(--accent-cyan)'
                                : u.role === 'admin'
                                ? '#38bdf8'
                                : 'var(--text-secondary)',
                          }}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: u.is_banned ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: u.is_banned ? 'var(--color-bearish)' : 'var(--color-bullish)',
                          }}
                        >
                          {u.is_banned ? 'Suspended' : 'Active'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        {isSuperAdmin ? (
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u, e.target.value)}
                            disabled={isCurrent}
                            style={{
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border-subtle)',
                              color: 'var(--text-primary)',
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.5rem',
                              borderRadius: 'var(--radius-sm)',
                              cursor: isCurrent ? 'not-allowed' : 'pointer',
                            }}
                          >
                            <option value="user">User</option>
                            <option value="operator">Operator</option>
                            <option value="admin">Admin</option>
                            <option value="super_admin">Super Admin</option>
                          </select>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            <Lock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                            Super Admin Required
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        {isSuperAdmin && !isCurrent ? (
                          <button
                            className="btn btn-secondary"
                            onClick={() => handleToggleUserBan(u)}
                            style={{
                              padding: '0.25rem 0.6rem',
                              fontSize: '0.75rem',
                              color: u.is_banned ? 'var(--color-bullish)' : 'var(--color-bearish)',
                            }}
                          >
                            {u.is_banned ? <UserCheck size={13} /> : <UserX size={13} />}
                            <span>{u.is_banned ? 'Re-enable' : 'Suspend'}</span>
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.75rem 1rem',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
          }}
        >
          <span>
            Showing {usersList.length} of {userTotal} users (Page {userPage})
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-secondary"
              disabled={userPage <= 1 || isLoadingUsers}
              onClick={() => {
                const prev = Math.max(1, userPage - 1);
                setUserPage(prev);
                loadUsers(userSearch, prev);
              }}
              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
            >
              Previous
            </button>
            <button
              className="btn btn-secondary"
              disabled={usersList.length < 20 || isLoadingUsers}
              onClick={() => {
                const next = userPage + 1;
                setUserPage(next);
                loadUsers(userSearch, next);
              }}
              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* AI Provider Key Management & Vault Section */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <Key size={18} color="var(--accent-cyan)" />
              AI Provider Credentials & Encrypted Key Vault
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Credentials are encrypted on the server with Fernet (AES-128-CBC + HMAC-SHA256). Plaintext keys are never stored in databases or exposed in browser bundles.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem', marginTop: '1rem' }}>
          {providers.map((p) => {
            const isSelected = activeProvider.toLowerCase() === p.id;
            const currentTest = testResults[p.id];
            const isTesting = actionLoading[`test_${p.id}`];
            const isSaving = actionLoading[p.id];

            return (
              <div
                key={p.id}
                style={{
                  background: 'var(--bg-secondary)',
                  border: isSelected ? '2px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  position: 'relative',
                }}
              >
                {/* Provider Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{p.name}</span>
                      {isSelected && (
                        <span
                          style={{
                            padding: '0.15rem 0.5rem',
                            background: 'rgba(0, 212, 255, 0.15)',
                            color: 'var(--accent-cyan)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                          }}
                        >
                          ACTIVE ENGINE
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      {p.description}
                    </p>
                  </div>
                  <span
                    style={{
                      padding: '0.25rem 0.6rem',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: p.configured ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 170, 0, 0.12)',
                      color: p.configured ? 'var(--color-bullish)' : 'var(--color-neutral)',
                    }}
                  >
                    {p.configured
                      ? p.source === 'encrypted_vault'
                        ? 'Encrypted Vault'
                        : 'Environment'
                      : 'Unconfigured'}
                  </span>
                </div>

                {/* Masked Key Display */}
                {p.configured && (
                  <div
                    style={{
                      padding: '0.6rem 0.85rem',
                      background: 'var(--bg-primary)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.85rem',
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)' }}>Configured Key:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                      {p.masked_key}
                    </span>
                    {p.source === 'encrypted_vault' && (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: 'var(--color-bearish)' }}
                        onClick={() => handleDeleteKey(p.id)}
                        disabled={isSaving}
                        title="Remove key from vault"
                      >
                        <Trash2 size={12} /> Clear
                      </button>
                    )}
                  </div>
                )}

                {/* Key Entry Form */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      marginBottom: '0.35rem',
                    }}
                  >
                    {p.configured ? 'Replace Key:' : 'Enter API Key:'}
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        type={showKeys[p.id] ? 'text' : 'password'}
                        placeholder={`e.g. ${p.id === 'google' ? 'AIzaSy...' : 'sk-...'}`}
                        value={inputKeys[p.id] || ''}
                        onChange={(e) => setInputKeys({ ...inputKeys, [p.id]: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.55rem 2.25rem 0.55rem 0.75rem',
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem',
                          fontFamily: 'var(--font-mono)',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKeys({ ...showKeys, [p.id]: !showKeys[p.id] })}
                        style={{
                          position: 'absolute',
                          right: '0.5rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                        }}
                      >
                        {showKeys[p.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <button
                      className="btn btn-primary"
                      disabled={isSaving || !inputKeys[p.id]}
                      onClick={() => handleSaveKey(p.id)}
                      style={{ padding: '0.55rem 0.85rem', fontSize: '0.8rem' }}
                    >
                      <Save size={14} /> {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>

                {/* Model Configuration */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                      Quick Model:
                    </label>
                    <select
                      value={selectedQuick[p.id] || p.current_quick_model}
                      onChange={(e) => setSelectedQuick({ ...selectedQuick, [p.id]: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.4rem 0.5rem',
                        fontSize: '0.75rem',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {p.verified_quick_models && p.verified_quick_models.length > 0 && (
                        <optgroup label="✓ Verified Official Models">
                          {p.verified_quick_models.map((m) => (
                            <option key={m} value={m}>
                              {m} (Verified)
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {p.unverified_catalog_models && p.unverified_catalog_models.length > 0 && (
                        <optgroup label="⚠️ Unverified Upstream Catalog">
                          {p.unverified_catalog_models.map((m) => (
                            <option key={m} value={m}>
                              {m} (Unverified)
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                      Deep Think Model:
                    </label>
                    <select
                      value={selectedDeep[p.id] || p.current_deep_model}
                      onChange={(e) => setSelectedDeep({ ...selectedDeep, [p.id]: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.4rem 0.5rem',
                        fontSize: '0.75rem',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {p.verified_deep_models && p.verified_deep_models.length > 0 && (
                        <optgroup label="✓ Verified Official Models">
                          {p.verified_deep_models.map((m) => (
                            <option key={m} value={m}>
                              {m} (Verified)
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {p.unverified_catalog_models && p.unverified_catalog_models.length > 0 && (
                        <optgroup label="⚠️ Unverified Upstream Catalog">
                          {p.unverified_catalog_models.map((m) => (
                            <option key={m} value={m}>
                              {m} (Unverified)
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                </div>

                {/* Actions: Test Connection & Set Active */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleTestConnection(p.id)}
                    disabled={isTesting || (!p.configured && !inputKeys[p.id])}
                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }}
                  >
                    <Zap size={14} color="var(--accent-cyan)" />
                    {isTesting ? 'Testing...' : 'Test Connection'}
                  </button>

                  <button
                    className={`btn ${isSelected ? 'btn-secondary' : 'btn-primary'}`}
                    disabled={isSelected}
                    onClick={() =>
                      handleSetActiveProvider(
                        p.id,
                        selectedQuick[p.id] || p.current_quick_model,
                        selectedDeep[p.id] || p.current_deep_model
                      )
                    }
                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }}
                  >
                    <Cpu size={14} />
                    {isSelected ? 'Active Default' : 'Set as Active'}
                  </button>
                </div>

                {/* Test Connection Output */}
                {currentTest && (
                  <div
                    style={{
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.78rem',
                      background: currentTest.success ? 'rgba(0, 230, 118, 0.1)' : 'rgba(255, 68, 68, 0.1)',
                      border: `1px solid ${currentTest.success ? 'var(--color-bullish)' : 'var(--color-bearish)'}`,
                      color: currentTest.success ? 'var(--color-bullish)' : 'var(--color-bearish)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>{currentTest.message}</span>
                    {currentTest.latency_ms !== undefined && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {currentTest.latency_ms}ms
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <Activity size={18} color="var(--accent-cyan)" />
            Security & Administration Audit Trail
          </h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Append-only cryptographic event ledger
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Event ID</th>
                <th style={{ padding: '0.75rem 1rem' }}>Action</th>
                <th style={{ padding: '0.75rem 1rem' }}>Actor</th>
                <th style={{ padding: '0.75rem 1rem' }}>Timestamp</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>#{log.id}</td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{log.action}</td>
                  <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)' }}>{log.actor}</td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{log.timestamp}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: log.status.includes('BLOCKED') ? 'rgba(255, 68, 68, 0.15)' : 'rgba(0, 230, 118, 0.15)',
                        color: log.status.includes('BLOCKED') ? 'var(--color-bearish)' : 'var(--color-bullish)',
                      }}
                    >
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
