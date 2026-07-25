import React, { createContext, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import AuthPage from './components/AuthPage';
import Dashboard from './components/Dashboard';

export const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

// ── Demo credentials ────────────────────────────────────────
export const DEMO_EMAIL    = 'hackathon@gmail.com';
export const DEMO_PASSWORD = '12345';
export const DEMO_USER = {
  uid:         'demo-user-hackathon',
  email:       DEMO_EMAIL,
  displayName: 'Hackathon User',
  isDemo:      true,
};

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="app-loading">
      <div className="loading-spinner"></div>
      <p>Initializing Medical-Image Enhancer...</p>
    </div>
  );
  return user ? children : <Navigate to="/" replace />;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return !user ? children : <Navigate to="/dashboard" replace />;
}

export default function App() {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if demo session is active (persists across refresh)
    const demoActive = sessionStorage.getItem('demo_session');
    if (demoActive === 'true') {
      setUser(DEMO_USER);
      setLoading(false);
      return;
    }

    // Otherwise listen to Firebase auth state
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Exposed so AuthPage can set demo user
  const loginAsDemo = () => {
    sessionStorage.setItem('demo_session', 'true');
    setUser(DEMO_USER);
  };

  // Called on logout — clears demo session too
  const logout = () => {
    sessionStorage.removeItem('demo_session');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginAsDemo, logout }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={
            <PublicRoute><AuthPage /></PublicRoute>
          } />
          <Route path="/dashboard" element={
            <PrivateRoute><Dashboard /></PrivateRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
