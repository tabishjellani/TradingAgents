import React, { useState } from 'react';
import { Cpu, CheckCircle2, FileText, Download, Play, MessageSquare, ShieldAlert } from 'lucide-react';
import type { AssetType, PortfolioRating } from '../types';

interface ResearchProps {
  initialSymbol?: string;
  initialAssetType?: AssetType;
}

export const Research: React.FC<ResearchProps> = ({
  initialSymbol = 'NVDA',
  initialAssetType = 'stock',
}) => {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [assetType, setAssetType] = useState<AssetType>(initialAssetType);
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().split('T')[0]);
  const [model, setModel] = useState('gemini-3.8-flash');
  const [analysts, setAnalysts] = useState<string[]>(['market', 'sentiment', 'news', 'fundamentals']);
  const [isRunning, setIsRunning] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(4); // Default to completed preview
  const [rating, setRating] = useState<PortfolioRating>('Buy');

  const toggleAnalyst = (key: string) => {
    setAnalysts((prev) =>
      prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key]
    );
  };

  const handleRunAnalysis = () => {
    setIsRunning(true);
    setActiveStep(1);
    const timer1 = setTimeout(() => setActiveStep(2), 1500);
    const timer2 = setTimeout(() => setActiveStep(3), 3000);
    const timer3 = setTimeout(() => {
      setActiveStep(4);
      setIsRunning(false);
      setRating('Buy');
    }, 4500);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  };

  const pipelineSteps = [
    { id: 1, title: 'Analyst Team Reports', desc: 'Market, sentiment, news, and SEC fundamentals gathering' },
    { id: 2, title: 'Research Debate', desc: 'Bull vs. Bear multi-round investment thesis challenge' },
    { id: 3, title: 'Risk Management Team', desc: 'Aggressive, conservative, and neutral debaters evaluate exposure' },
    { id: 4, title: 'Portfolio Manager Decision', desc: 'Final 5-tier recommendation & execution allocation' },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Research Workspace</h1>
          <p className="page-subtitle">
            Execute full multi-agent financial deep-dives powered by TradingAgents multi-tier reasoning.
          </p>
        </div>
      </div>

      <div className="grid-3" style={{ gridTemplateColumns: '1fr 2fr' }}>
        {/* Left Column: Analysis Configuration Form */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h2 className="card-title">
            <Cpu size={18} color="var(--accent-cyan)" />
            Run Parameters
          </h2>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
              TICKER / SYMBOL
            </label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              style={{
                width: '100%',
                padding: '0.6rem 0.8rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                fontSize: '1rem',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
              ASSET CLASS
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className={`btn ${assetType === 'stock' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setAssetType('stock')}
              >
                Equity / Stock
              </button>
              <button
                type="button"
                className={`btn ${assetType === 'crypto' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setAssetType('crypto')}
              >
                Cryptocurrency
              </button>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
              ANALYSIS DATE (POINT-IN-TIME)
            </label>
            <input
              type="date"
              value={tradeDate}
              onChange={(e) => setTradeDate(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem 0.8rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
              AI REASONING MODEL (FREE TIER)
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem 0.8rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <option value="gemini-3.8-flash">Google Gemini 3.8 Flash (Free Quota)</option>
              <option value="gemini-3.5-flash-lite">Google Gemini 3.5 Flash Lite</option>
              <option value="groq-llama3.3">Groq LLaMA 3.3 70B (Fast Free Tier)</option>
              <option value="ollama-local">Ollama Local PC (100% Zero-Cost)</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.6rem', fontWeight: 600 }}>
              ACTIVE ANALYST SQUAD
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem' }}>
              {[
                { id: 'market', label: 'Market Technicals' },
                { id: 'sentiment', label: 'Social Sentiment' },
                { id: 'news', label: 'Macro & News' },
                { id: 'fundamentals', label: 'SEC Fundamentals', disabled: assetType === 'crypto' },
              ].map((item) => (
                <label
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    cursor: item.disabled ? 'not-allowed' : 'pointer',
                    opacity: item.disabled ? 0.4 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={analysts.includes(item.id) && !item.disabled}
                    disabled={item.disabled}
                    onChange={() => toggleAnalyst(item.id)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem', padding: '0.8rem' }}
            disabled={isRunning}
            onClick={handleRunAnalysis}
          >
            {isRunning ? (
              <>Running Multi-Agent Synthesis...</>
            ) : (
              <>
                <Play size={16} /> Execute Research Run
              </>
            )}
          </button>
        </div>

        {/* Right Column: Execution Pipeline & Report View */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Agent Workflow Progress Bar */}
          <div className="card">
            <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Multi-Agent Workflow Execution
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
              {pipelineSteps.map((step) => {
                const isCurrent = activeStep === step.id && isRunning;
                const isComplete = activeStep >= step.id;
                return (
                  <div
                    key={step.id}
                    style={{
                      padding: '0.75rem',
                      borderRadius: 'var(--radius-md)',
                      background: isCurrent
                        ? 'rgba(0, 229, 255, 0.1)'
                        : isComplete
                        ? 'var(--bg-surface-elevated)'
                        : 'var(--bg-secondary)',
                      border: isCurrent
                        ? '1px solid var(--accent-cyan)'
                        : '1px solid var(--border-subtle)',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                      <CheckCircle2
                        size={14}
                        color={isComplete ? 'var(--color-bullish)' : 'var(--text-muted)'}
                      />
                      <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>Step {step.id}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                      {step.title}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Synthesized Research Report Output */}
          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <h2 style={{ fontSize: '1.3rem', fontWeight: 700 }}>
                    Research Consensus: {symbol}
                  </h2>
                  <span className={`badge-rating ${rating.toLowerCase()}`}>
                    {rating}
                  </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  As-of trade date {tradeDate} • Engine v0.7.0 • Model: {model}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}>
                  <Download size={14} /> Export HTML
                </button>
                <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}>
                  <FileText size={14} /> Markdown
                </button>
              </div>
            </div>

            {/* Synthesized Executive Decision */}
            <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--color-bullish)' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.35rem', color: 'var(--color-bullish)' }}>
                Portfolio Manager Synthesis
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                Based on strong momentum confirmed by technical indicators (RSI 61.4, MACD bullish crossover) alongside continuing secular growth in enterprise AI infrastructure spending, the Portfolio Manager assigns an actionable <strong>BUY</strong> rating. Downside risks highlighted by the Conservative Debator are bounded with a proposed 4.5% position allocation and an initial stop-loss at the 50-day moving average ($128.50).
              </p>
            </div>

            {/* Deep-Dive Agent Debate Accordions */}
            <div className="grid-2">
              <div style={{ background: 'var(--bg-surface-elevated)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--color-bullish)', fontWeight: 600 }}>
                  <MessageSquare size={16} /> Bull Researcher Thesis
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Accelerating adoption of next-generation GPU architectures and expanding margin profiles in data center compute underpin multi-quarter EPS revisions upwards.
                </p>
              </div>

              <div style={{ background: 'var(--bg-surface-elevated)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--color-bearish)', fontWeight: 600 }}>
                  <ShieldAlert size={16} /> Bear Researcher & Risk Challenge
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Customer concentration in top cloud hyperscalers represents potential revenue lumpiness if cap-ex cycles normalize into late 2026.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
