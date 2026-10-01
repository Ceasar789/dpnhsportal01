// ============================================
// FILE: src/pages/auth/ResetPassword.jsx
// PURPOSE: New password entry after reset link click — Supabase
// ============================================

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../config/supabase';
import { Lock, Eye, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react';
import { validatePassword, PASSWORD_HINT } from '../../lib/passwordPolicy';
import FlippingLogo from '../../components/FlippingLogo';

const ResetPassword = () => {
  const navigate = useNavigate();

  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]       = useState(false);
  const [isLoading, setIsLoading]             = useState(false);
  const [message, setMessage]                 = useState('');
  const [isSuccess, setIsSuccess]             = useState(false);
  const [validSession, setValidSession]       = useState(false);
  const [checking, setChecking]               = useState(true);

  // ============================================
  // DETECT SUPABASE PASSWORD_RECOVERY EVENT
  // ============================================
  useEffect(() => {
    let timeoutId;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        setValidSession(true);
        setChecking(false);
        clearTimeout(timeoutId);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setValidSession(true);
        setChecking(false);
        clearTimeout(timeoutId);
      } else {
        timeoutId = setTimeout(() => {
          setChecking(false);
        }, 1500);
      }
    }).catch(() => {
      timeoutId = setTimeout(() => {
        setChecking(false);
      }, 1500);
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeoutId);
    };
  }, []);

  // ============================================
  // HANDLE SUBMIT
  // ============================================
  const handleSubmit = async (e) => {
    e.preventDefault();
    const passwordError = validatePassword(password);
    if (passwordError) { setMessage(passwordError); return; }
    if (password !== confirmPassword) { setMessage('Passwords do not match'); return; }

    setIsLoading(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setIsSuccess(true);
      setMessage('Password updated successfully! Redirecting to login...');
      setTimeout(() => navigate('/login'), 2500);
    } catch (error) {
      setMessage('Failed to update password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <div
      className="min-h-screen flex items-center justify-center relative"
      style={{
        backgroundImage: 'url(/capstonebackground.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-white rounded-lg p-10">

          {/* Header */}
          <div className="flex flex-col items-center mb-8">
            <FlippingLogo size={60} />
            <h1 className="text-2xl font-bold mt-4" style={{ color: '#1a2b4a' }}>Set New Password</h1>
            <div className="w-10 h-1 mt-2" style={{ backgroundColor: '#d4a843' }} />
          </div>

          {/* Checking / verifying */}
          {checking && (
            <div role="status" className="flex flex-col items-center py-6">
              <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mb-3"
                style={{ borderColor: '#0d2b5c', borderTopColor: 'transparent' }} aria-hidden="true" />
              <p className="text-sm" style={{ color: '#6B7280' }}>Verifying reset link...</p>
            </div>
          )}

          {/* Message */}
          {message && (
            <div role="alert" className="flex items-start gap-2 p-3 rounded-md mb-4"
              style={{ backgroundColor: isSuccess ? '#d1fae5' : '#fee2e2' }}>
              {isSuccess
                ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" style={{ color: '#065f46' }} aria-hidden="true" />
                : <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: '#b91c1c' }} aria-hidden="true" />}
              <p className="text-sm flex-1 whitespace-pre-line" style={{ color: isSuccess ? '#065f46' : '#b91c1c' }}>{message}</p>
            </div>
          )}

          {/* Form — valid session */}
          {!checking && validSession && !isSuccess && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {[
                { id: 'reset-new-password',     label: 'NEW PASSWORD',     value: password,        setter: setPassword },
                { id: 'reset-confirm-password', label: 'CONFIRM PASSWORD', value: confirmPassword, setter: setConfirmPassword },
              ].map(({ id, label, value, setter }) => (
                <div key={id}>
                  <label htmlFor={id} className="block text-xs font-semibold tracking-widest mb-2" style={{ color: '#6B7280' }}>{label}</label>
                  <div className="relative">
                    <Lock size={20} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#64748b' }} aria-hidden="true" />
                    <input
                      id={id}
                      name={id}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      aria-describedby={label === 'NEW PASSWORD' ? 'reset-password-rule' : undefined}
                      value={value}
                      onChange={(e) => setter(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-12 pl-12 pr-12 rounded-md text-sm outline-none focus:ring-2 placeholder:text-[#64748b]"
                      style={{ backgroundColor: '#F8F9FA', border: '1px solid #E5E7EB' }}
                    />
                    {/* One toggle drives both fields, so both say the same thing — which
                        is what they do. */}
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded">
                      {showPassword
                        ? <EyeOff size={20} style={{ color: '#64748b' }} aria-hidden="true" />
                        : <Eye    size={20} style={{ color: '#64748b' }} aria-hidden="true" />}
                    </button>
                  </div>
                  {label === 'NEW PASSWORD' && (
                    <p id="reset-password-rule" className="text-xs mt-1.5" style={{ color: '#5d6b80' }}>{PASSWORD_HINT}</p>
                  )}
                </div>
              ))}

              <button type="submit" disabled={isLoading} aria-busy={isLoading}
                className="w-full h-12 rounded-md text-white font-semibold text-base hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ backgroundColor: '#0d2b5c' }}>
                {isLoading
                  ? <div className="flex items-center justify-center"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" /><span className="sr-only">Updating</span></div>
                  : 'Update Password'}
              </button>
            </form>
          )}

          {/* Invalid / expired link */}
          {!checking && !validSession && !isSuccess && (
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle size={30} style={{ color: '#dc3545' }} aria-hidden="true" />
              </div>
              <h3 className="text-lg font-bold" style={{ color: '#dc3545' }}>Link Expired or Invalid</h3>
              <p className="text-sm text-center" style={{ color: '#6B7280' }}>
                This password reset link has expired or already been used. Please request a new one.
              </p>
              <Link
                to="/forgot-password"
                className="w-full h-12 rounded-md text-white font-semibold hover:opacity-90 transition-opacity flex items-center justify-center"
                style={{ backgroundColor: '#0d2b5c' }}>
                Request New Link
              </Link>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default ResetPassword;