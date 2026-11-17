// ============================================
// FILE: src/pages/auth/ChangePassword.jsx
// PURPOSE: Authenticated user changes password — Supabase
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { validatePassword, PASSWORD_RULES } from '../../lib/passwordPolicy';
import PasswordField from '../../components/ui/form/PasswordField';
import FlippingLogo from '../../components/FlippingLogo';

const ChangePassword = () => {
  const navigate = useNavigate();
  const { updatePassword, userData } = useAuth();
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
    } catch {
      setMessage('Failed to change password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

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
        <div className="bg-white rounded-lg p-10 shadow-sm">
          <div className="flex flex-col items-center mb-8">
            <FlippingLogo size={60} />
            <h1 className="text-2xl font-bold mt-4" style={{ color: '#1a2b4a' }}>Change Password</h1>
            <div className="w-10 h-1 mt-2" style={{ backgroundColor: '#d4a843' }} />
            {userData?.email && (
              <p className="text-sm mt-2 max-w-full text-center [overflow-wrap:anywhere]" style={{ color: '#6B7280' }}>{userData.email}</p>
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

          {/* U6: the kit's PasswordField (16px, 44px show/hide); the live checklist is the
              real policy (lib/passwordPolicy.js). handleSubmit above is unchanged. */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-1">
            <PasswordField id="change-new-password" name="change-new-password" label="NEW PASSWORD" value={password}
              onChange={(e) => setPassword(e.target.value)} rules={PASSWORD_RULES} />
            <PasswordField id="change-confirm-password" name="change-confirm-password" label="CONFIRM NEW PASSWORD" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)} />

            <button type="submit" disabled={isLoading} aria-busy={isLoading}
              className="w-full h-12 rounded-md text-white font-semibold text-base hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: '#0d2b5c' }}>
              {isLoading
                ? <div className="flex items-center justify-center"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" /><span className="sr-only">Updating</span></div>
                : 'Update Password'}
            </button>
          </form>

          <div className="flex justify-center mt-5">
            <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center min-h-11 text-sm px-2 rounded" style={{ color: '#6c757d' }}>
              ← Go back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChangePassword;
