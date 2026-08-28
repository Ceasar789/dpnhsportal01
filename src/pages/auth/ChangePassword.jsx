// ============================================
// FILE: src/pages/auth/ChangePassword.jsx
// PURPOSE: Authenticated user changes password — Supabase
// ============================================

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Lock, Eye, EyeOff } from 'lucide-react';

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
    if (password.length < 8) { setMessage('Password must be at least 8 characters'); return; }
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
            <img src="/capstonelogo.png" alt="DPNHS Logo" style={{ width: '60px', height: '60px' }} />
            <h2 className="text-2xl font-bold mt-4" style={{ color: '#1a2b4a' }}>Change Password</h2>
            <div className="w-10 h-1 mt-2" style={{ backgroundColor: '#d4a843' }} />
            {userData?.email && (
              <p className="text-sm mt-2" style={{ color: '#6B7280' }}>{userData.email}</p>
            )}
          </div>

          {message && (
            <div className="flex items-start gap-2 p-3 rounded-md mb-4"
              style={{ backgroundColor: isSuccess ? '#d1fae5' : '#fee2e2' }}>
              <span className="text-lg">{isSuccess ? '✅' : '⚠'}</span>
              <p className="text-sm flex-1" style={{ color: isSuccess ? '#065f46' : '#dc3545' }}>{message}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {[
              { label: 'NEW PASSWORD', value: password, setter: setPassword },
              { label: 'CONFIRM NEW PASSWORD', value: confirmPassword, setter: setConfirmPassword },
            ].map(({ label, value, setter }) => (
              <div key={label}>
                <label className="block text-xs font-semibold tracking-widest mb-2" style={{ color: '#6B7280' }}>{label}</label>
                <div className="relative">
                  <Lock size={20} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
                  <input type={showPassword ? 'text' : 'password'} value={value} onChange={(e) => setter(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-12 pl-12 pr-12 rounded-md text-sm outline-none focus:ring-2"
                    style={{ backgroundColor: '#F8F9FA', border: '1px solid #E5E7EB' }} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2">
                    {showPassword ? <EyeOff size={20} style={{ color: '#9CA3AF' }} /> : <Eye size={20} style={{ color: '#9CA3AF' }} />}
                  </button>
                </div>
              </div>
            ))}

            <button type="submit" disabled={isLoading}
              className="w-full h-12 rounded-md text-white font-semibold text-base hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: '#0d2b5c' }}>
              {isLoading
                ? <div className="flex items-center justify-center"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>
                : 'Update Password'}
            </button>
          </form>

          <div className="flex justify-center mt-5">
            <button onClick={() => navigate(-1)} className="text-sm" style={{ color: '#6c757d' }}>
              ← Go back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChangePassword;