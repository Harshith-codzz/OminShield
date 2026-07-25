import React, { useState, useRef, useCallback } from 'react';
import { useAuth } from '../App';
import { runPipeline, PIPELINE_STEPS } from '../utils/pipeline';
import ResultsPanel from './ResultsPanel';
import './UploadTab.css';

/* ── Pipeline Step ──────────────────────────────────────── */
function PipelineStep({ step, status, result }) {
  const colorMap = {
    cyan:   '#00d4ff',
    purple: '#a78bfa',
    amber:  '#f59e0b',
    blue:   '#3b82f6',
    green:  '#10b981',
  };
  const col = colorMap[step.color] || '#00d4ff';

  return (
    <div className={`pipeline-step pipeline-step--${status}`}>
      <div className="step-indicator" style={{ '--step-color': col }}>
        {status === 'running' && <div className="step-pulse" style={{ '--step-color': col }} />}
        {status === 'done' ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : status === 'running' ? (
          <div className="step-spinner" style={{ borderTopColor: col }} />
        ) : (
          <div className="step-dot" style={{ background: status === 'pending' ? 'var(--text-muted)' : col }} />
        )}
      </div>
      <div className="step-content">
        <div className="step-header">
          <span className="step-icon">{step.icon}</span>
          <span className="step-label">{step.label}</span>
          {status === 'running' && <span className="step-status-badge running">Running</span>}
          {status === 'done'    && <span className="step-status-badge done">Done</span>}
        </div>
        <p className="step-subtitle">{step.subtitle}</p>
        {status === 'done' && result && (
          <div className="step-result-preview animate-fadeIn">
            {Object.entries(result).slice(0, 3).map(([k, v]) => (
              <span key={k} className="result-chip">
                <span className="chip-key">{k.replace(/_/g, ' ')}:</span>
                <span className="chip-val">
                  {typeof v === 'number'
                    ? (v < 1 && v > 0 ? v.toFixed(3) : v.toFixed(2))
                    : String(v).slice(0, 16)}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Upload Zone (Supports Multi-File Batch Selection) ────── */
function UploadZone({ onFiles, files }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFiles(Array.from(e.dataTransfer.files));
    }
  }, [onFiles]);

  if (files && files.length > 0) return (
    <div className="file-preview-list">
      <div className="file-preview-header">
        <span className="file-count-badge">📁 {files.length} File{files.length > 1 ? 's' : ''} Selected</span>
        <button className="btn btn-ghost file-change-btn" onClick={() => onFiles([])}>
          Change Files
        </button>
      </div>
      <div className="file-items-scroll">
        {files.map((file, idx) => (
          <div key={idx} className="file-item-chip">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span className="file-name">{file.name}</span>
            <span className="file-size">{(file.size / 1024).toFixed(1)} KB</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div
      className={`upload-zone ${drag ? 'drag-active' : ''}`}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      id="upload-zone"
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
      aria-label="Upload MRI image volumes"
    >
      <input
        ref={inputRef}
        id="file-input"
        type="file"
        multiple
        accept="image/*,.nii,.nii.gz,.dcm,.gz"
        style={{ display: 'none' }}
        onChange={e => e.target.files && e.target.files.length > 0 && onFiles(Array.from(e.target.files))}
      />
      <div className="upload-icon">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="url(#upGrad)" strokeWidth="1.5">
          <defs>
            <linearGradient id="upGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop stopColor="#00d4ff" /><stop offset="1" stopColor="#7c3aed" />
            </linearGradient>
          </defs>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <h3>Drop single or multiple MRI volumes here</h3>
      <p>Supports NIfTI (.nii, .nii.gz) · DICOM (.dcm) · PNG · JPG (Batch Upload Enabled)</p>
      <span className="upload-browse">Browse files →</span>
    </div>
  );
}

/* ── Main Upload Tab ────────────────────────────────────── */
export default function UploadTab({ onSwitchToHistory }) {
  const { user } = useAuth();
  const [files, setFiles]                 = useState([]);
  const [phase, setPhase]                 = useState('idle');
  const [stepStatuses, setStepStatuses]   = useState({});
  const [stepResults, setStepResults]     = useState({});
  const [analysisResults, setAnalysisResults] = useState(null);
  const [error, setError]                 = useState('');
  const [progress, setProgress]           = useState(0);

  const handleFilesChange = (fileList) => {
    setFiles(fileList);
    setPhase('idle');
    setAnalysisResults(null);
    setStepStatuses({});
    setStepResults({});
    setError('');
    setProgress(0);
  };

  const handleAnalyze = async () => {
    if (!files || files.length === 0) return;
    setPhase('running');
    setError('');
    setStepStatuses({});
    setStepResults({});
    setAnalysisResults(null);
    setProgress(0);

    const initStatuses = {};
    PIPELINE_STEPS.forEach(s => { initStatuses[s.id] = 'pending'; });
    setStepStatuses(initStatuses);

    let currentStep = 0;
    const onStepComplete = (stepId, result) => {
      currentStep++;
      setStepStatuses(prev => ({ ...prev, [stepId]: 'done' }));
      setStepResults(prev => ({ ...prev, [stepId]: result }));
      setProgress(Math.round((currentStep / PIPELINE_STEPS.length) * 100));
      if (currentStep < PIPELINE_STEPS.length) {
        const nextId = PIPELINE_STEPS[currentStep].id;
        setStepStatuses(prev => ({ ...prev, [nextId]: 'running' }));
      }
    };

    setStepStatuses(prev => ({ ...prev, [PIPELINE_STEPS[0].id]: 'running' }));

    try {
      const results = await runPipeline(files, onStepComplete);
      setAnalysisResults(results);
      setPhase('done');
      setProgress(100);
    } catch (err) {
      setPhase('error');
      setError('Analysis pipeline failed: ' + err.message);
    }
  };

  const handleReset = () => {
    setFiles([]);
    setPhase('idle');
    setAnalysisResults(null);
    setStepStatuses({});
    setStepResults({});
    setError('');
    setProgress(0);
  };

  const totalDuration = PIPELINE_STEPS.reduce((a, s) => a + s.duration, 0) * (files.length || 1);
  const estimatedSec  = Math.round(totalDuration / 1000);

  return (
    <div className="upload-tab">
      {/* ════ LEFT PANEL ════ */}
      <div className="upload-left">
        {/* Upload Section */}
        <div className="upload-section">
          <div className="section-title-row">
            <h2 className="section-title">Upload MRI Volumes</h2>
            {phase === 'done' && (
              <button id="new-analysis-btn" className="btn btn-ghost btn-sm" onClick={handleReset}>
                + New Batch
              </button>
            )}
          </div>
          <p className="section-desc">Upload single or multiple MRI scans to run AI enhancement & segmentation</p>

          <UploadZone onFiles={handleFilesChange} files={files} />

          {files && files.length > 0 && phase === 'idle' && (
            <button
              id="analyze-btn"
              className="btn btn-primary analyze-btn animate-fadeIn"
              onClick={handleAnalyze}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" />
              </svg>
              Analyze {files.length} MRI File{files.length > 1 ? 's' : ''} (~{estimatedSec}s)
            </button>
          )}
        </div>

        {/* Pipeline Steps */}
        {(phase === 'running' || phase === 'done') && (
          <div className="pipeline-section animate-fadeIn">
            <div className="pipeline-header">
              <h3 className="section-title" style={{ fontSize: 14 }}>Analysis Pipeline</h3>
              <span className={`badge ${phase === 'done' ? 'badge-green' : 'badge-cyan'}`}>
                {phase === 'done' ? '✓ Complete' : '⚡ Running'}
              </span>
            </div>
            <div className="pipeline-progress-row">
              <div className="progress-bar" style={{ flex: 1 }}>
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="pipeline-progress-label">{progress}%</span>
            </div>
            <div className="pipeline-steps">
              {PIPELINE_STEPS.map((step) => (
                <PipelineStep
                  key={step.id}
                  step={step}
                  status={stepStatuses[step.id] || 'pending'}
                  result={stepResults[step.id]}
                />
              ))}
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="error-card animate-fadeIn">
            <span style={{ fontSize: 20 }}>⚠️</span>
            <p>{error}</p>
            <button className="btn btn-ghost btn-sm" onClick={handleReset}>Retry</button>
          </div>
        )}
      </div>

      {/* ════ RIGHT PANEL ════ */}
      <div className="upload-right">
        {phase === 'done' && analysisResults ? (
          <ResultsPanel results={analysisResults} onViewHistory={onSwitchToHistory} />
        ) : (
          <div className={`results-placeholder ${phase === 'running' ? 'placeholder-scanning' : ''}`}>
            <div className="placeholder-inner">
              <div className="placeholder-icon">
                {phase === 'running' ? (
                  <div className="loading-spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
                ) : (
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                )}
              </div>
              <h3 className="placeholder-title">
                {phase === 'running' ? 'Analyzing your MRI volumes...' : 'Output will appear here'}
              </h3>
              <p className="placeholder-desc">
                {phase === 'running'
                  ? 'The AI pipeline is processing your scan(s). 3-way visual outputs (Raw, Enhanced, Defect Detection) and evaluation metrics will show here.'
                  : 'Upload single or multiple MRI scans and click Analyze. 3 visual images (Sample, Enhanced, Defect Detection) and complete metrics will be displayed.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
