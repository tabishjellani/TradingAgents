import React from 'react';
import { ShieldAlert, Terminal, RefreshCw } from 'lucide-react';

export const ConfigError: React.FC = () => {
  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-primary)',
        backgroundImage:
          'radial-gradient(circle at 50% 50%, rgba(239, 68, 68, 0.08) 0%, transparent 60%)',
        padding: '1.5rem',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '520px',
          background: 'var(--bg-glass)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), 0 0 24px rgba(239, 68, 68, 0.1)',
          padding: '2.5rem 2rem',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '52px',
            height: '52px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(239, 68, 68, 0.15)',
            color: 'var(--color-bearish)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            marginBottom: '1.25rem',
          }}
        >
          <ShieldAlert size={28} />
        </div>

        <h1
          style={{
            fontSize: '1.4rem',
            fontWeight: 800,
            marginBottom: '0.75rem',
            color: 'var(--text-primary)',
          }}
        >
          Authentication Configuration Required
        </h1>

        <p
          style={{
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            marginBottom: '1.5rem',
          }}
        >
          TradingAgentX requires active Supabase Auth credentials to protect private dashboard
          resources, portfolios, and research pipelines. The application has failed closed to
          safeguard trading systems.
        </p>

        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            textAlign: 'left',
            marginBottom: '1.5rem',
            fontSize: '0.8rem',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--accent-cyan)',
              marginBottom: '0.6rem',
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
            }}
          >
            <Terminal size={14} />
            <span>Required Environment Variables</span>
          </div>
          <div style={{ color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
            <span style={{ color: 'var(--color-neutral)' }}>•</span> VITE_SUPABASE_URL
          </div>
          <div style={{ color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--color-neutral)' }}>•</span> VITE_SUPABASE_ANON_KEY
          </div>
          <div
            style={{
              marginTop: '0.75rem',
              paddingTop: '0.6rem',
              borderTop: '1px solid var(--border-subtle)',
              fontSize: '0.72rem',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Configure these in Cloudflare Pages &rarr; Settings &rarr; Environment variables.
          </div>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="btn btn-secondary"
          style={{ padding: '0.6rem 1.25rem', fontSize: '0.82rem' }}
        >
          <RefreshCw size={14} />
          <span>Reload Application</span>
        </button>
      </div>
    </div>
  );
};
