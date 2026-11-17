// ============================================
// FILE: src/pages/auth/ResetPassword.jsx
// PURPOSE: New password entry after reset link click — Supabase
// ============================================

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../config/supabase';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { validatePassword, PASSWORD_RULES } from '../../lib/passwordPolicy';
import { backendRequest } from '../../lib/backendApi';
import { appErrorMessage } from '../../lib/appErrorMessage';
import PasswordField from '../../components/ui/form/PasswordField';
import FlippingLogo from '../../components/FlippingLogo';

const ResetPassword = ({ invitation = false }) => {
  const navigate = useNavigate();

  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading]             = useState(false);
  const [message, setMessage]                 = useState('');
  const [isSuccess, setIsSuccess]             = useState(false);
  const [validSession, setValidSession]       = useState(false);
  const [checking, setChecking]               = useState(true);
  const strengthScore = [
    password.length >= 12,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  const strengthLabel = strengthScore <= 2 ? 'Weak' : strengthScore === 3 ? 'Fair' : strengthScore === 4 ? 'Good' : 'Strong';

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
      if (invitation) {
        await backendRequest('/api/onboarding/complete', {
          method: 'POST', body: JSON.stringify({ password }),
        });
        await supabase.auth.signOut();
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
      }
      setIsSuccess(true);
      setMessage(`${invitation ? 'Account activated' : 'Password updated'} successfully! Redirecting to login...`);
      setTimeout(() => navigate('/login'), 2500);
    } catch (error) {
      setMessage(appErrorMessage(error, 'Failed to update password. Please try again.'));
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
            <h1 className="text-2xl font-bold mt-4" style={{ color: '#1a2b4a' }}>{invitation ? 'Create Your Password' : 'Set New Password'}</h1>
            <div className="w-10 h-1 mt-2" style={{ backgroundColor: '#d4a843' }} />
          </div>

          {/* Checking / verifying */}
          {checking && (
            <div role="status" className="flex flex-col items-center py-6">
              <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mb-3"
                style={{ borderColor: '#0d2b5c', borderTopColor: 'transparent' }} aria-hidden="true" />
              <p className="text-sm" style={{ color: '#6B7280' }}>Verifying {invitation ? 'invitation' : 'reset'} link...</p>
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
            // U6: the kit's PasswordField with the live checklist (real policy); handleSubmit unchanged.
            <form onSubmit={handleSubmit} className="flex flex-col gap-1">
              <PasswordField id="reset-new-password" name="reset-new-password" label="NEW PASSWORD" value={password}
                onChange={(e) => setPassword(e.target.value)} rules={PASSWORD_RULES} />
              {password && (
                <div className="-mt-2 mb-4" role="status" aria-live="polite">
                  <div className="flex justify-between text-xs mb-1" style={{ color: '#5d6b80' }}>
                    <span>Password strength</span><strong>{strengthLabel}</strong>
                  </div>
                  <div className="grid grid-cols-5 gap-1" aria-hidden="true">
                    {[1, 2, 3, 4, 5].map((segment) => (
                      <span key={segment} className="h-1 rounded" style={{ backgroundColor: segment <= strengthScore ? '#0d2b5c' : '#dbe2ea' }} />
                    ))}
                  </div>
                </div>
              )}
              <PasswordField id="reset-confirm-password" name="reset-confirm-password" label="CONFIRM PASSWORD" value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)} />

              <button type="submit" disabled={isLoading} aria-busy={isLoading}
                className="w-full h-12 rounded-md text-white font-semibold text-base hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ backgroundColor: '#0d2b5c' }}>
                {isLoading
                  ? <div className="flex items-center justify-center"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" /><span className="sr-only">Updating</span></div>
                  : invitation ? 'Activate Account' : 'Update Password'}
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
                This {invitation ? 'invitation' : 'password reset link'} has expired or already been used. {invitation ? 'Ask an administrator to resend it.' : 'Please request a new one.'}
              </p>
              <Link
                to={invitation ? '/login' : '/forgot-password'}
                className="w-full h-12 rounded-md text-white font-semibold hover:opacity-90 transition-opacity flex items-center justify-center"
                style={{ backgroundColor: '#0d2b5c' }}>
                {invitation ? 'Return to Login' : 'Request New Link'}
              </Link>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
