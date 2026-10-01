// ============================================
// FILE: src/pages/auth/ChangePassword.jsx
// PURPOSE: Authenticated user changes password — Supabase
// ============================================

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Lock, Eye, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react';
import { validatePassword, PASSWORD_HINT } from '../../lib/passwordPolicy';
import FlippingLogo from '../../components/FlippingLogo';

const ChangePassword = () => {
  const navigate = useNavigate();
  const { updatePassword, userData } = useAuth();
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]       = useState(false);
  const [isLoading, setIsLoading]             = useState(false);
  const [message, setMessage]                 = useState('');
  const [isSuccess, setIsSuccess]             = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const passwordError = validatePassword(password);
    if (passwordError) { setMessage(passwordError); return; }
    if (password !== confirmPassword) { setMessage('Passwords do not match'); return; }

    setIsLoading(true);
    setMessage('');
    try {
      await updatePassword(password);
      setIsSuccess(true);
      setMessage('Password changed successfully!');
      setTimeout(() => navigate(-1), 2000);
    } catch (error) {
      setMessage('Failed to change password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F0F2F5' }}>
      <div className="w-full max-w-md mx-4">
        <div className="bg-white rounded-lg p-10 shadow-sm">
          <div className="flex flex-col items-center mb-8">
            <FlippingLogo size={60} />
            <h1 className="text-2xl font-bold mt-4" style={{ color: '#1a2b4a' }}>Change Password</h1>
            <div className="w-10 h-1 mt-2" style={{ backgroundColor: '#d4a843' }} />
            {userData?.email && (
              <p className="text-sm mt-2" style={{ color: '#6B7280' }}>{userData.email}</p>
            )}
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
            {[
              { id: 'change-new-password',     label: 'NEW PASSWORD',         value: password,        setter: setPassword },
              { id: 'change-confirm-password', label: 'CONFIRM NEW PASSWORD', value: confirmPassword, setter: setConfirmPassword },
            ].map(({ id, label, value, setter }) => (
              <div key={id}>
                <label htmlFor={id} className="block text-xs font-semibold tracking-widest mb-2" style={{ color: '#6B7280' }}>{label}</label>
                <div className="relative">
                  <Lock size={20} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#64748b' }} aria-hidden="true" />
                  <input id={id} name={id} type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                    aria-describedby={label === 'NEW PASSWORD' ? 'change-password-rule' : undefined}
                    value={value} onChange={(e) => setter(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-12 pl-12 pr-12 rounded-md text-sm outline-none focus:ring-2 placeholder:text-[#64748b]"
                    style={{ backgroundColor: '#F8F9FA', border: '1px solid #E5E7EB' }} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded">
                    {showPassword ? <EyeOff size={20} style={{ color: '#64748b' }} aria-hidden="true" /> : <Eye size={20} style={{ color: '#64748b' }} aria-hidden="true" />}
                  </button>
                </div>
                {label === 'NEW PASSWORD' && (
                  <p id="change-password-rule" className="text-xs mt-1.5" style={{ color: '#5d6b80' }}>{PASSWORD_HINT}</p>
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

          <div className="flex justify-center mt-5">
            <button type="button" onClick={() => navigate(-1)} className="text-sm py-1.5 px-2 rounded" style={{ color: '#6c757d' }}>
              ← Go back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChangePassword;