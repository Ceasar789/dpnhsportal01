// ============================================
// FILE: src/pages/auth/ForgotPassword.jsx
// PURPOSE: Password reset request — Supabase
// ============================================

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Mail, CheckCircle2, AlertTriangle } from 'lucide-react';
import FlippingLogo from '../../components/FlippingLogo';
import TurnstileWidget from '../../components/ui/form/TurnstileWidget';
import { CAPTCHA_MESSAGES, turnstileSiteKey } from '../../lib/turnstile';
import { friendlyError } from '../../lib/friendlyError';

const SEND_FAILED = 'Failed to send reset email. Please check the address and try again.';

const ForgotPassword = () => {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail]         = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage]     = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  // P2: optional security check; absent key = no widget, no token, as before.
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setMessage('Please enter your email address'); setIsSuccess(false); return; }
    if (turnstileSiteKey() && !captchaToken) { setMessage(CAPTCHA_MESSAGES.needed); setIsSuccess(false); return; }
    setIsLoading(true);
    setMessage('');
    try {
      await (captchaToken ? sendPasswordReset(email, { captchaToken }) : sendPasswordReset(email));
      setMessage('Password reset email sent! Check your inbox.');
      setIsSuccess(true);
    } catch (error) {
      // Fixed sentences only; the answer never depends on whether the address has an account.
      setMessage(error?.code === 'captcha_failed' ? friendlyError(error) : SEND_FAILED);
      setIsSuccess(false);
    } finally {
      setIsLoading(false);
      setCaptchaReset((n) => n + 1);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative"
      style={{ backgroundImage: 'url(/capstonebackground.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-white rounded-lg p-10">
          <div className="flex flex-col items-center mb-8">
            <FlippingLogo size={60} />
            <h1 className="text-2xl font-bold mt-4" style={{ color: '#1a2b4a' }}>Reset Password</h1>
            <div className="w-10 h-1 mt-2" style={{ backgroundColor: '#d4a843' }} />
            <p className="text-sm text-center mt-3" style={{ color: '#6B7280' }}>
              Enter your email and we'll send you a reset link.
            </p>
          </div>

          {message && (
            <div role="alert" className="flex items-start gap-2 p-3 rounded-md mb-4"
              style={{ backgroundColor: isSuccess ? '#d1fae5' : '#fee2e2' }}>
              {isSuccess
                ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" style={{ color: '#065f46' }} aria-hidden="true" />
                : <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: '#b91c1c' }} aria-hidden="true" />}
              <p className="text-sm flex-1 whitespace-pre-line" style={{ color: isSuccess ? '#065f46' : '#b91c1c' }}>{message}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label htmlFor="forgot-email" className="block text-xs font-semibold tracking-widest mb-2" style={{ color: '#6B7280' }}>EMAIL ADDRESS</label>
              <div className="relative">
                <Mail size={20} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#64748b' }} aria-hidden="true" />
                <input id="forgot-email" name="email" type="email" autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="JuanDelacruz@gmail.com"
                  className="w-full h-12 pl-12 pr-4 rounded-md text-base outline-none focus:ring-2 placeholder:text-[#64748b]"
                  style={{ backgroundColor: '#F8F9FA', border: '1px solid #E5E7EB' }} />
              </div>
            </div>

            <TurnstileWidget onToken={setCaptchaToken} resetSignal={captchaReset} action="forgot-password" />

            <button type="submit" disabled={isLoading} aria-busy={isLoading}
              className="w-full h-12 rounded-md text-white font-semibold text-base hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: '#0d2b5c' }}>
              {isLoading
                ? <div className="flex items-center justify-center"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" /><span className="sr-only">Sending</span></div>
                : 'Send Reset Link'}
            </button>
          </form>

          <div className="flex flex-col items-center gap-2 mt-5">
            <Link to="/login" className="inline-flex items-center min-h-11 text-sm px-2 rounded" style={{ color: '#6c757d' }}>
              ← Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;