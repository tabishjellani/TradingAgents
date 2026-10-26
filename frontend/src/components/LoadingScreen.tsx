import React from 'react';
import { Zap } from 'lucide-react';

export const LoadingScreen: React.FC = () => {
  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-primary)',
        backgroundImage:
          'radial-gradient(circle at 50% 50%, rgba(0, 229, 255, 0.08) 0%, transparent 60%)',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: 'var(--radius-md)',
          background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-inverted)',
          boxShadow: 'var(--shadow-glow)',
          marginBottom: '1.5rem',
          animation: 'pulse 2s infinite ease-in-out',
        }}
      >
        <Zap size={28} />
      </div>

      <div
        style={{
          fontSize: '1.15rem',
          fontWeight: 700,
          letterSpacing: '-0.01em',
          background: 'linear-gradient(90deg, #ffffff, #94a3b8)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '0.5rem',
        }}
      >
        TradingAgents Terminal
      </div>

      <div
        style={{
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: 'var(--accent-cyan)',
            boxShadow: '0 0 8px var(--accent-cyan)',
          }}
        />
        <span>Restoring cryptographically verified session...</span>
      </div>
    </div>
  );
};
