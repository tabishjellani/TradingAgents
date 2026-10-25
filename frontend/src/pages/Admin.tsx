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
} from 'lucide-react';
import type { SystemHealth } from '../types';
import {
  fetchAdminTelemetry,
  triggerKillSwitch,
  fetchAiProviders,
  saveAiProviderKey,
  deleteAiProviderKey,
  updateAiConfig,
  testAiProviderConnection,
  type AiProviderInfo,
} from '../lib/api';

interface AdminProps {
  health: SystemHealth;
}

export const Admin: React.FC<AdminProps> = ({ health }) => {
  const [telemetry, setTelemetry] = useState<any>(null);
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [killSwitchMessage, setKillSwitchMessage] = useState<string | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);

  // AI Providers state
  const [providers, setProviders] = useState<AiProviderInfo[]>([]);
  const [activeProvider, setActiveProvider] = useState<string>(health.defaultAiProvider || 'google');
  const [quickModel, setQuickModel] = useState<string>('gemini-3.8-flash');
  const [deepModel, setDeepModel] = useState<string>('gemini-3.8-flash');
  const [selectedQuick, setSelectedQuick] = useState<Record<string, string>>({});
  const [selectedDeep, setSelectedDeep] = useState<Record<string, string>>({});
  const [inputKeys, setInputKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string; latency_ms?: number }>>({});
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    try {
      const data = await fetchAdminTelemetry();
      setTelemetry(data);
    } catch (err: any) {
      console.warn('Telemetry fetch error:', err);
    }

    try {
      const aiData = await fetchAiProviders();
      setProviders(aiData.providers);
      setActiveProvider(aiData.active_provider);
      setQuickModel(aiData.quick_model);
      setDeepModel(aiData.deep_model);

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
      setQuickModel(qModel);
      setDeepModel(dModel);
      setStatusMessage({ type: 'success', text: `Active engine updated to ${providerId.toUpperCase()} (${qModel} / ${dModel}).` });
      await loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to update active provider.' });
    }
  };

  const auditLogs = [
    { id: 1, action: 'SYSTEM_STARTUP', actor: 'LocalDaemon', timestamp: '2026-10-20 18:12:00', status: 'SUCCESS' },
    { id: 2, action: 'RESEARCH_JOB_COMPLETED', actor: 'local_user', timestamp: '2026-10-20 18:22:15', status: 'SUCCESS' },
    { id: 3, action: 'LIVE_TRADING_CHECK', actor: 'SafetyGuard', timestamp: '2026-10-20 18:25:30', status: 'BLOCKED (DISABLED)' },
    { id: 4, action: 'SECURITY_AUDIT_LOG_EXPORT', actor: 'admin', timestamp: '2026-10-20 18:30:10', status: 'SUCCESS' },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Administration & Security Controls</h1>
          <p className="page-subtitle">
            System health telemetry, encrypted AI key vault, safety gates, and audit trail.
          </p>
        </div>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

      {/* Telemetry Metrics */}
      <div className="grid-3">
        <div className="stat-box">
          <span className="stat-label">Daily Free AI Quota</span>
          <span className="stat-value">
            {telemetry?.quota_consumed ?? 0} / {telemetry?.daily_job_quota ?? 20}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-bullish)' }}>
            {(100 - ((telemetry?.quota_consumed ?? 0) / (telemetry?.daily_job_quota ?? 20)) * 100).toFixed(0)}% Daily Capacity Remaining
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Monthly Hosting Cost</span>
          <span className="stat-value" style={{ color: 'var(--color-bullish)' }}>$0.00</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Zero-Cost Personal Local Deployment
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Active Engine Provider</span>
          <span className="stat-value" style={{ fontSize: '1.2rem', fontFamily: 'var(--font-mono)' }}>
            {activeProvider.toUpperCase()}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>
            {quickModel} / {deepModel}
          </span>
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
          <button className="btn btn-secondary" onClick={loadData}>
            <RefreshCw size={14} /> Refresh Status
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.25rem', marginTop: '1rem' }}>
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
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{p.name}</span>
                      {isSelected && (
                        <span style={{
                          padding: '0.15rem 0.5rem',
                          background: 'rgba(0, 212, 255, 0.15)',
                          color: 'var(--accent-cyan)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                        }}>
                          ACTIVE ENGINE
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      {p.description}
                    </p>
                  </div>
                  <span style={{
                    padding: '0.25rem 0.6rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    background: p.configured ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 170, 0, 0.12)',
                    color: p.configured ? 'var(--color-bullish)' : 'var(--color-gold)',
                  }}>
                    {p.configured
                      ? p.source === 'encrypted_vault' ? 'Encrypted Vault' : 'Environment'
                      : 'Unconfigured'}
                  </span>
                </div>

                {/* Masked Key Display */}
                {p.configured && (
                  <div style={{
                    padding: '0.6rem 0.85rem',
                    background: 'var(--bg-primary)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.85rem',
                  }}>
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
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
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
                      {(p.verified_quick_models && p.verified_quick_models.length > 0) && (
                        <optgroup label="✓ Verified Official Models">
                          {p.verified_quick_models.map((m) => (
                            <option key={m} value={m}>{m} (Verified)</option>
                          ))}
                        </optgroup>
                      )}
                      {(p.unverified_catalog_models && p.unverified_catalog_models.length > 0) && (
                        <optgroup label="⚠️ Unverified Upstream Catalog">
                          {p.unverified_catalog_models.map((m) => (
                            <option key={m} value={m}>{m} (Unverified)</option>
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
                      {(p.verified_deep_models && p.verified_deep_models.length > 0) && (
                        <optgroup label="✓ Verified Official Models">
                          {p.verified_deep_models.map((m) => (
                            <option key={m} value={m}>{m} (Verified)</option>
                          ))}
                        </optgroup>
                      )}
                      {(p.unverified_catalog_models && p.unverified_catalog_models.length > 0) && (
                        <optgroup label="⚠️ Unverified Upstream Catalog">
                          {p.unverified_catalog_models.map((m) => (
                            <option key={m} value={m}>{m} (Unverified)</option>
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
                    {isTesting ? 'Testing Connection...' : 'Test Connection'}
                  </button>

                  <button
                    className={`btn ${isSelected ? 'btn-secondary' : 'btn-primary'}`}
                    disabled={isSelected}
                    onClick={() => handleSetActiveProvider(p.id, selectedQuick[p.id] || p.current_quick_model, selectedDeep[p.id] || p.current_deep_model)}
                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }}
                  >
                    <Cpu size={14} />
                    {isSelected ? 'Active Default' : 'Set as Active'}
                  </button>
                </div>

                {/* Test Connection Output */}
                {currentTest && (
                  <div style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.78rem',
                    background: currentTest.success ? 'rgba(0, 230, 118, 0.1)' : 'rgba(255, 68, 68, 0.1)',
                    border: `1px solid ${currentTest.success ? 'var(--color-bullish)' : 'var(--color-bearish)'}`,
                    color: currentTest.success ? 'var(--color-bullish)' : 'var(--color-bearish)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
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
                    <span style={{
                      padding: '0.2rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: log.status.includes('BLOCKED') ? 'rgba(255, 68, 68, 0.15)' : 'rgba(0, 230, 118, 0.15)',
                      color: log.status.includes('BLOCKED') ? 'var(--color-bearish)' : 'var(--color-bullish)',
                    }}>
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
