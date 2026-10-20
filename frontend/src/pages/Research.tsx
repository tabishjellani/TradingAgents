import React, { useState, useEffect, useRef } from 'react';
import { Cpu, CheckCircle2, FileText, Download, Play, MessageSquare, ShieldAlert, AlertCircle, XCircle } from 'lucide-react';
import type { AssetType, PortfolioRating } from '../types';
import { submitResearchJob, getResearchJob, cancelResearchJob } from '../lib/api';

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
  const [analysts, setAnalysts] = useState<string[]>(['market', 'news', 'fundamentals']);
  const [isRunning, setIsRunning] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(0);
  const [rating, setRating] = useState<PortfolioRating | null>(null);
  
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<number>(0);
  const [jobStepText, setJobStepText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reportResult, setReportResult] = useState<any>(null);
  const [markdownReport, setMarkdownReport] = useState<string | null>(null);

  const pollIntervalRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const toggleAnalyst = (key: string) => {
    setAnalysts((prev) =>
      prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key]
    );
  };

  const handleRunAnalysis = async () => {
    setIsRunning(true);
    setErrorMessage(null);
    setReportResult(null);
    setMarkdownReport(null);
    setRating(null);
    setActiveStep(1);
    setJobProgress(5);
    setJobStepText('Submitting analysis job to Python research worker...');

    try {
      const job = await submitResearchJob({
        symbol,
        asset_type: assetType,
        trade_date: tradeDate,
        analysts,
        config_overrides: { model },
      });

      setCurrentJobId(job.id);
      setJobStepText(job.currentStep || 'Initializing agent graph...');

      // Start polling job status
      pollIntervalRef.current = setInterval(async () => {
        try {
          const updated = await getResearchJob(job.id);
          setJobProgress(updated.progress_percent);
          setJobStepText(updated.current_step);

          if (updated.progress_percent < 30) {
            setActiveStep(1);
          } else if (updated.progress_percent < 60) {
            setActiveStep(2);
          } else if (updated.progress_percent < 90) {
            setActiveStep(3);
          } else {
            setActiveStep(4);
          }

          if (updated.status === 'completed') {
            clearInterval(pollIntervalRef.current);
            setIsRunning(false);
            setReportResult(updated.result);
            setMarkdownReport(updated.markdown_report);
            const r = updated.result?.rating as PortfolioRating;
            setRating(r || 'Hold');
            setActiveStep(4);
          } else if (updated.status === 'failed') {
            clearInterval(pollIntervalRef.current);
            setIsRunning(false);
            setErrorMessage(updated.error_message || 'Research execution failed.');
          } else if (updated.status === 'cancelled') {
            clearInterval(pollIntervalRef.current);
            setIsRunning(false);
            setErrorMessage('Research execution cancelled by user.');
          }
        } catch (err: any) {
          logger_warn(err);
        }
      }, 1500);

    } catch (err: any) {
      setIsRunning(false);
      setErrorMessage(err.message || 'Failed to submit research job.');
    }
  };

  function logger_warn(err: any) {
    console.warn("Poll status check:", err);
  }

  const handleCancel = async () => {
    if (!currentJobId) return;
    await cancelResearchJob(currentJobId);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setIsRunning(false);
    setJobStepText('Execution cancelled');
  };

  const handleExportMarkdown = () => {
    if (!markdownReport) return;
    const blob = new Blob([markdownReport], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TradingAgents_Report_${symbol}_${tradeDate}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportHTML = () => {
    if (!markdownReport) return;
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>TradingAgents Report - ${symbol}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; margin: 40px auto; line-height: 1.6; color: #333; }
    h1, h2, h3 { color: #004d61; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; background: #00e5ff; color: #000; font-weight: bold; }
  </style>
</head>
<body>
  <div style="white-space: pre-wrap; font-family: inherit;">${markdownReport}</div>
</body>
</html>`;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TradingAgents_Report_${symbol}_${tradeDate}.html`;
    a.click();
    URL.revokeObjectURL(url);
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
              disabled={isRunning}
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
                disabled={isRunning}
                onClick={() => setAssetType('stock')}
              >
                Equity / Stock
              </button>
              <button
                type="button"
                className={`btn ${assetType === 'crypto' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                disabled={isRunning}
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
              disabled={isRunning}
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
              disabled={isRunning}
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
              <option value="gemini-3.8-flash">Google Gemini 3.8 Flash (Free Tier)</option>
              <option value="gemini-3.5-flash-lite">Google Gemini 3.5 Flash Lite</option>
              <option value="groq-llama3.3">Groq LLaMA 3.3 70B (Fast Free Tier)</option>
              <option value="gpt-4o">OpenAI GPT-4o (Paid Key Required)</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.6rem', fontWeight: 600 }}>
              ACTIVE ANALYST SQUAD
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem' }}>
              {[
                { id: 'market', label: 'Market Technicals' },
                { id: 'news', label: 'Macro & News' },
                { id: 'fundamentals', label: 'SEC Fundamentals', disabled: assetType === 'crypto' },
              ].map((item) => (
                <label
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    cursor: item.disabled || isRunning ? 'not-allowed' : 'pointer',
                    opacity: item.disabled ? 0.4 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={analysts.includes(item.id) && !item.disabled}
                    disabled={item.disabled || isRunning}
                    onChange={() => toggleAnalyst(item.id)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1, padding: '0.8rem' }}
              disabled={isRunning}
              onClick={handleRunAnalysis}
            >
              {isRunning ? (
                <>Running Multi-Agent Engine...</>
              ) : (
                <>
                  <Play size={16} /> Execute Research Run
                </>
              )}
            </button>
            {isRunning && (
              <button
                className="btn btn-secondary"
                style={{ padding: '0.8rem', color: 'var(--color-bearish)' }}
                onClick={handleCancel}
                title="Cancel ongoing job"
              >
                <XCircle size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Execution Pipeline & Report View */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Agent Workflow Progress Bar */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Multi-Agent Workflow Execution
              </h3>
              {isRunning && (
                <span style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                  {jobProgress}% • {jobStepText}
                </span>
              )}
            </div>

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

          {/* Actionable Error State if Provider Key Missing or Call Fails */}
          {errorMessage && (
            <div className="card" style={{ borderLeft: '4px solid var(--color-bearish)', background: 'rgba(255, 68, 68, 0.05)' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <AlertCircle size={20} color="var(--color-bearish)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <h4 style={{ color: 'var(--color-bearish)', margin: '0 0 0.35rem 0', fontSize: '0.95rem' }}>
                    Multi-Agent Execution Notice
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {errorMessage}
                  </p>
                  {errorMessage.includes('API key') && (
                    <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem' }}>
                      <strong>Setup Instruction:</strong> Get a 100% free API key from <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-cyan)' }}>Google AI Studio</a> or <a href="https://console.groq.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-cyan)' }}>Groq Cloud</a>, and place it in your <code>.env</code> file as <code>GEMINI_API_KEY=your_key</code> or <code>GROQ_API_KEY=your_key</code>.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Synthesized Research Report Output */}
          {reportResult ? (
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <h2 style={{ fontSize: '1.3rem', fontWeight: 700 }}>
                      Research Consensus: {symbol}
                    </h2>
                    {rating && (
                      <span className={`badge-rating ${rating.toLowerCase()}`}>
                        {rating}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    As-of trade date {tradeDate} • Engine v0.7.0 • Model: {model}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }} onClick={handleExportHTML}>
                    <Download size={14} /> Export HTML
                  </button>
                  <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }} onClick={handleExportMarkdown}>
                    <FileText size={14} /> Markdown
                  </button>
                </div>
              </div>

              {/* Synthesized Executive Decision */}
              {reportResult.debates?.final_decision && (
                <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--accent-cyan)' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.35rem', color: 'var(--accent-cyan)' }}>
                    Portfolio Manager Synthesis & Allocation
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {reportResult.debates.final_decision}
                  </p>
                </div>
              )}

              {/* Deep-Dive Agent Debate Accordions */}
              <div className="grid-2">
                <div style={{ background: 'var(--bg-surface-elevated)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--color-bullish)', fontWeight: 600 }}>
                    <MessageSquare size={16} /> Bull Researcher Thesis
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {reportResult.debates?.bull_history || 'No bull debate record.'}
                  </p>
                </div>

                <div style={{ background: 'var(--bg-surface-elevated)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--color-bearish)', fontWeight: 600 }}>
                    <ShieldAlert size={16} /> Bear Researcher & Risk Challenge
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {reportResult.debates?.bear_history || 'No bear debate record.'}
                  </p>
                </div>
              </div>

              {/* Raw Markdown Report Accordion */}
              {markdownReport && (
                <details style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.8rem' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    View Full Generated Report Markdown
                  </summary>
                  <pre style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--bg-primary)', overflowX: 'auto', borderRadius: 'var(--radius-sm)' }}>
                    {markdownReport}
                  </pre>
                </details>
              )}
            </div>
          ) : !errorMessage && !isRunning ? (
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              <Cpu size={40} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>No Active Analysis</h3>
              <p style={{ fontSize: '0.85rem', maxWidth: '400px', lineHeight: 1.5 }}>
                Configure run parameters on the left and click <strong>Execute Research Run</strong> to dispatch your multi-agent financial research squad.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
