import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';
import './HistoryTab.css';

function HistoryCard({ doc }) {
  const { fileName, fileSize, anatomy, segmentationType, metrics, score, analyzedAt } = doc;
  const isBrain = anatomy === 'Brain';
  const isPatho = segmentationType?.includes('Patho');

  const colorForAnatomy = isPatho ? 'var(--rose)' : isBrain ? 'var(--cyan)' : 'var(--amber)';

  const ts = analyzedAt?.toDate ? analyzedAt.toDate() : new Date(analyzedAt || Date.now());

  return (
    <div className="history-card animate-fadeIn">
      <div className="hcard-top">
        <div className="hcard-file">
          <div className="hcard-filename">{fileName || 'Unnamed scan'}</div>
          <div className="hcard-meta">
            <span>{fileSize}</span>
            <span style={{ color: 'var(--border)' }}>·</span>
            <span style={{ color: colorForAnatomy, fontWeight: 600 }}>
              {isPatho ? '⚠️' : isBrain ? '🧠' : '🦴'} {segmentationType || anatomy}
            </span>
          </div>
        </div>
        <span
          className="badge"
          style={{
            background: isBrain ? 'var(--cyan-dim)' : 'var(--amber-dim)',
            color: isBrain ? 'var(--cyan)' : 'var(--amber)',
            border: `1px solid ${isBrain ? 'rgba(0,212,255,0.2)' : 'rgba(245,158,11,0.2)'}`,
            flexShrink: 0,
          }}
        >
          {anatomy}
        </span>
      </div>

      {/* Metric chips */}
      <div className="hcard-metrics">
        <div className="hcard-metric">
          <span className="hcard-metric-val" style={{ color: 'var(--cyan)' }}>
            {metrics?.dice != null ? metrics.dice.toFixed(3) : '—'}
          </span>
          <span className="hcard-metric-key">Dice</span>
        </div>
        <div className="hcard-metric">
          <span className="hcard-metric-val" style={{ color: 'var(--green)' }}>
            {score?.ssim != null ? score.ssim.toFixed(3) : '—'}
          </span>
          <span className="hcard-metric-key">SSIM</span>
        </div>
        <div className="hcard-metric">
          <span className="hcard-metric-val" style={{ color: 'var(--purple-light)' }}>
            {score?.psnr != null ? score.psnr.toFixed(1) : '—'}
          </span>
          <span className="hcard-metric-key">PSNR</span>
        </div>
      </div>

      <div className="hcard-footer">
        <span className="hcard-time">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          {ts.toLocaleString()}
        </span>
        <span className="badge badge-green" style={{ fontSize: 9 }}>✓ Stored</span>
      </div>
    </div>
  );
}

export default function HistoryTab() {
  const { user } = useAuth();
  const [docs, setDocs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const q = query(
          collection(db, 'analyses'),
          where('uid', '==', user.uid),
          orderBy('analyzedAt', 'desc')
        );
        const snap = await getDocs(q);
        setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        if (e.code === 'failed-precondition') {
          setError('Firestore index building — try again in a moment.');
        } else {
          setError('Could not load history: ' + e.message);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  return (
    <div className="history-tab">
      <div className="history-header">
        <div>
          <h2 className="history-title">Analysis History</h2>
          <p className="history-subtitle">
            {loading ? 'Loading…' : `${docs.length} scan${docs.length !== 1 ? 's' : ''} stored`}
          </p>
        </div>
        {docs.length > 0 && (
          <span className="badge badge-cyan">{docs.length} records</span>
        )}
      </div>

      {loading ? (
        <div className="history-loading">
          <div className="loading-spinner" />
          <span>Loading your analyses...</span>
        </div>
      ) : error ? (
        <div className="history-empty">
          <div className="history-empty-icon">⚠️</div>
          <h3>Unable to load</h3>
          <p>{error}</p>
        </div>
      ) : docs.length === 0 ? (
        <div className="history-empty">
          <div className="history-empty-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <h3>No analyses yet</h3>
          <p>Upload and analyze an MRI scan — your results will appear here automatically.</p>
        </div>
      ) : (
        <div className="history-grid">
          {docs.map(doc => <HistoryCard key={doc.id} doc={doc} />)}
        </div>
      )}
    </div>
  );
}
