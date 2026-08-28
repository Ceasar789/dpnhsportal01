// ============================================
// FILE: src/pages/auth/VerifyEmail.jsx
// PURPOSE: Email verification notice — Supabase
// ============================================

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Mail } from 'lucide-react';

const VerifyEmail = () => {
  const navigate = useNavigate();
  const { sendVerificationEmail, user, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage]     = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const handleResend = async () => {
    setIsLoading(true);
    setMessage('');
    try {
      await sendVerificationEmail();
      setIsSuccess(true);
      setMessage('Verification email sent! Please check your inbox.');
    } catch (error) {
      setIsSuccess(false);
      setMessage('Failed to resend. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative"
      style={{ backgroundImage: 'url(/capstonebackground.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-white rounded-lg p-10 text-center">
          <div className="flex flex-col items-center mb-6">
            <img src="/capstonelogo.png" alt="DPNHS Logo" style={{ width: '60px', height: '60px' }} />
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mt-4 mb-3">
              <Mail size={32} className="text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold" style={{ color: '#1a2b4a' }}>Verify Your Email</h2>
            <div className="w-10 h-1 mt-2" style={{ backgroundColor: '#d4a843' }} />
          </div>

          <p className="text-sm mb-2" style={{ color: '#4a5568' }}>
            A verification email was sent to:
          </p>
          <p className="font-semibold mb-6" style={{ color: '#0d2b5c' }}>
            {user?.email || 'your email address'}
          </p>
          <p className="text-sm mb-6" style={{ color: '#6B7280' }}>
            Please check your inbox and click the link to verify your account before logging in.
          </p>

          {message && (
            <div className="flex items-start gap-2 p-3 rounded-md mb-4 text-left"
              style={{ backgroundColor: isSuccess ? '#d1fae5' : '#fee2e2' }}>
              <span>{isSuccess ? '✅' : '⚠'}</span>
              <p className="text-sm" style={{ color: isSuccess ? '#065f46' : '#dc3545' }}>{message}</p>
            </div>
          )}

          <button onClick={handleResend} disabled={isLoading}
            className="w-full h-12 rounded-md text-white font-semibold text-base hover:opacity-90 transition-opacity disabled:opacity-50 mb-3"
            style={{ backgroundColor: '#0d2b5c' }}>
            {isLoading
              ? <div className="flex items-center justify-center"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>
              : 'Resend Verification Email'}
          </button>

          <button onClick={handleLogout} className="text-sm" style={{ color: '#6c757d' }}>
            Back to login
          </button>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;