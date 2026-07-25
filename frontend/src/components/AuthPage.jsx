import React, { useState, useEffect, useRef } from 'react';
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth, DEMO_EMAIL, DEMO_PASSWORD } from '../App';
import './AuthPage.css';

/* ── Animated Particle Canvas ─────────────────────────────── */
function ParticleCanvas() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animId;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);

    const particles = Array.from({ length: 50 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.2 + 0.3,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      opacity: Math.random() * 0.4 + 0.1,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 212, 255, ${p.opacity})`;
        ctx.fill();
      });
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0, 212, 255, ${0.06 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  }, []);
  return <canvas ref={canvasRef} className="auth-canvas" style={{ width: '100%', height: '100%' }} />;
}

/* ── Left Visual Panel ────────────────────────────────────── */
function AuthVisual() {
  const steps = [
    { num: 1, label: 'Upload MRI Volume', tag: 'NIfTI · DICOM · PNG' },
    { num: 2, label: 'Preprocess + Classify', tag: 'Denoise · N4 · CNN' },
    { num: 3, label: 'Enhance + Score', tag: 'PSNR · SSIM · BRISQUE' },
    { num: 4, label: 'Segment + Metrics', tag: 'Dice · Jaccard · ASD' },
  ];

  return (
    <div className="auth-visual">
      <ParticleCanvas />
      <div className="auth-blob auth-blob-1" />
      <div className="auth-blob auth-blob-2" />
      <div className="auth-blob auth-blob-3" />

      <div className="auth-visual-content animate-fadeIn">
        {/* Animated brain graphic */}
        <div className="auth-brain-visual">
          <div className="brain-ring" />
          <div className="brain-ring" />
          <div className="brain-ring" />
          <div className="brain-core">
            <svg className="brain-icon-svg" width="64" height="64" viewBox="0 0 64 64" fill="none">
              <defs>
                <linearGradient id="brainGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#00d4ff" />
                  <stop offset="1" stopColor="#a78bfa" />
                </linearGradient>
              </defs>
              {/* Stylized brain/MRI icon */}
              <circle cx="32" cy="32" r="20" stroke="url(#brainGrad)" strokeWidth="1.5" fill="none" />
              <path d="M20 32 C20 24 26 18 32 18 C38 18 44 24 44 32" stroke="url(#brainGrad)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              <path d="M24 36 C24 40 28 44 32 44 C36 44 40 40 40 36" stroke="url(#brainGrad)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              <line x1="32" y1="18" x2="32" y2="44" stroke="url(#brainGrad)" strokeWidth="1" strokeDasharray="2 3" />
              <circle cx="32" cy="32" r="3" fill="url(#brainGrad)" />
              <circle cx="24" cy="26" r="1.5" fill="#00d4ff" opacity="0.7" />
              <circle cx="40" cy="26" r="1.5" fill="#a78bfa" opacity="0.7" />
              <circle cx="27" cy="38" r="1.5" fill="#10b981" opacity="0.7" />
              <circle cx="37" cy="38" r="1.5" fill="#f59e0b" opacity="0.7" />
            </svg>
          </div>
          <div className="orbit-dot orbit-dot-1" />
          <div className="orbit-dot orbit-dot-2" />
          <div className="orbit-dot orbit-dot-3" />
          <div className="scan-line" />
        </div>

        <h1 className="auth-visual-title">
          Medical-Image<br />Enhancer
        </h1>
        <p className="auth-visual-desc">
          Upload brain or spine MRI scans and get instant enhancement,
          segmentation, and quality metrics powered by deep learning.
        </p>

        <div className="auth-pipeline">
          {steps.map(s => (
            <div key={s.num} className="auth-pipeline-step">
              <div className="step-num">{s.num}</div>
              <span className="step-label">{s.label}</span>
              <span className="step-tag">{s.tag}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Main Auth Page ───────────────────────────────────────── */
export default function AuthPage() {
  const { loginAsDemo } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // ── Demo credential shortcut ─────────────────────────────
    if (email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD) {
      loginAsDemo();
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  };

  const friendlyError = (code) => {
    const map = {
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/user-not-found': 'No account found with this email.',
      'auth/too-many-requests': 'Too many attempts. Please try again later.',
      'auth/popup-closed-by-user': 'Sign-in popup was closed.',
    };
    return map[code] || 'Authentication failed. Please try again.';
  };

  return (
    <div className="auth-root">
      {/* Left: Visual */}
      <AuthVisual />

      {/* Right: Form */}
      <div className="auth-form-panel">
        <div className="auth-form-inner">
          {/* Brand */}
          <div className="auth-brand">
            <div className="auth-logo">
              <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
                <circle cx="18" cy="18" r="17" stroke="url(#alg1)" strokeWidth="2"/>
                <path d="M9 18c0-4.97 4.03-9 9-9s9 4.03 9 9-4.03 9-9 9" stroke="url(#alg2)" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="18" cy="18" r="4" fill="url(#alg1)"/>
                <defs>
                  <linearGradient id="alg1" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#00d4ff"/><stop offset="1" stopColor="#7c3aed"/>
                  </linearGradient>
                  <linearGradient id="alg2" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#7c3aed"/><stop offset="1" stopColor="#00d4ff"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div>
              <div className="auth-brand-name">Medical-Image Enhancer</div>
              <div className="auth-brand-tagline">MRI Analysis Platform</div>
            </div>
          </div>

          {/* Card */}
          <div className="auth-card animate-fadeInScale">
            <div className="auth-card-header">
              <h2 className="auth-title">Welcome back</h2>
              <p className="auth-subtitle">Sign in to access your MRI analysis dashboard</p>
            </div>

            {/* Google */}
            <button
              className="btn-google"
              onClick={handleGoogle}
              disabled={loading}
              id="google-signin-btn"
            >
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <div className="auth-divider">
              <span>or sign in with email</span>
            </div>

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label className="form-label">Email address</label>
                <input
                  id="email"
                  className="input-field"
                  type="email"
                  placeholder="doctor@hospital.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <div className="input-wrapper">
                  <input
                    id="password"
                    className="input-field"
                    type={showPass ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="pass-toggle"
                    onClick={() => setShowPass(s => !s)}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="auth-error animate-fadeIn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink:0}}>
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {error}
                </div>
              )}

              <button
                id="auth-submit-btn"
                type="submit"
                className="btn btn-primary auth-submit"
                disabled={loading}
              >
                {loading ? (
                  <><div className="btn-spinner" /> Signing in...</>
                ) : (
                  'Sign In →'
                )}
              </button>
            </form>


          </div>

          {/* Feature pills */}
          <div className="auth-features">
            {['🧠 Brain Segmentation', '🦴 Spine Analysis', '📊 PSNR/SSIM Metrics', '🔒 Secure & Private'].map(f => (
              <span key={f} className="auth-feature-pill">{f}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
