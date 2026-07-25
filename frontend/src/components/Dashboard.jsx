import React, { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../App';
import UploadTab from './UploadTab';
import HistoryTab from './HistoryTab';
import './Dashboard.css';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('upload');

  const handleLogout = async () => {
    if (user?.isDemo) {
      logout();          // clears demo session
    } else {
      await signOut(auth); // Firebase sign out
      logout();            // clears context user
    }
  };

  const initials = user?.displayName
    ? user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || 'ME';

  return (
    <div className="dashboard-root">
      {/* ── Navbar ────────────────────────────────────── */}
      <header className="navbar">
        <div className="navbar-brand">
          <div className="navbar-logo">
            <svg width="24" height="24" viewBox="0 0 36 36" fill="none">
              <circle cx="18" cy="18" r="17" stroke="url(#nlg1)" strokeWidth="2"/>
              <path d="M9 18c0-4.97 4.03-9 9-9s9 4.03 9 9-4.03 9-9 9" stroke="url(#nlg2)" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="18" cy="18" r="4" fill="url(#nlg1)"/>
              <defs>
                <linearGradient id="nlg1" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#00d4ff"/><stop offset="1" stopColor="#7c3aed"/>
                </linearGradient>
                <linearGradient id="nlg2" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#7c3aed"/><stop offset="1" stopColor="#00d4ff"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span className="navbar-title">Medical-Image Enhancer</span>
          <span className="navbar-badge">MRI Platform</span>
        </div>

        <nav className="navbar-tabs">
          <button
            id="tab-upload"
            className={`nav-tab ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Analyze
          </button>
          <button
            id="tab-history"
            className={`nav-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            History
          </button>
        </nav>

        <div className="navbar-user">
          <div className="user-info">
            <span className="user-name">{user?.displayName || user?.email?.split('@')[0]}</span>
            <span className="user-email">{user?.email}</span>
          </div>
          <div className="avatar">{initials}</div>
          <button
            id="logout-btn"
            className="btn btn-ghost logout-btn"
            onClick={handleLogout}
            title="Sign out"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </header>

      {/* ── Main Content ──────────────────────────────── */}
      <main className="dashboard-main">
        {activeTab === 'upload' && (
          <UploadTab onSwitchToHistory={() => setActiveTab('history')} />
        )}
        {activeTab === 'history' && <HistoryTab />}
      </main>
    </div>
  );
}
