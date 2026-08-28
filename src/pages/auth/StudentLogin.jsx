import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';

const normalizeRole = (role) => {
  if (!role) return 'student';
  const normalized = role.toString().trim().toLowerCase().replace(/ /g, '_');
  if (normalized === 'admin' || normalized === 'main_admin' || normalized === 'main admin') {
    return 'main_admin';
  }
  return normalized;
};

const StudentLogin = () => {
  const navigate = useNavigate();
  const { login, logout, user, userData, isAuthenticated } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loginAttempted, setLoginAttempted] = useState(false);

  const timeoutRef = useRef(null);

  // FIXED: Redirect already-authenticated students immediately
  useEffect(() => {
    if (isAuthenticated && userData) {
      if (normalizeRole(userData.role) === 'student') {
        navigate('/student-dashboard', { replace: true });
      }
    }
  }, [isAuthenticated, userData, navigate]);

  useEffect(() => {
    if (!loginAttempted) return;
    if (!user) return;
    if (!userData) return;

    const validateAndRedirect = async () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      const normalizedUserRole = normalizeRole(userData?.role);

      if (normalizedUserRole !== 'student') {
        console.warn(`🚫 Security: Blocked non-student (${userData.role}) from accessing student portal`);
        await logout();
        setErrorMessage(`❌ Access Denied. This portal is for STUDENTS ONLY.\n\nYour account role is: "${userData.role}"\n\nPlease use the Faculty/Admin portal to log in.`);
        setLoginAttempted(false);
        setIsLoading(false);
        return;
      }

      console.log('✅ Student verified - redirecting to dashboard');
      navigate('/student-dashboard', { replace: true });
    };

    validateAndRedirect();
  }, [user, userData, loginAttempted, navigate, logout]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setErrorMessage('Please fill in all fields'); return; }

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsLoading(true);
    setErrorMessage('');
    setLoginAttempted(true);

    timeoutRef.current = setTimeout(() => {
      setErrorMessage('Login is taking longer than expected. Please try again.');
      setLoginAttempted(false);
      setIsLoading(false);
      timeoutRef.current = null;
    }, 10000);

    try {
      await login(email, password);
    } catch (error) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      console.error('Login error:', error);
      setErrorMessage(getErrorMessage(error.message));
      setLoginAttempted(false);
      setIsLoading(false);
    }
  };

  const getErrorMessage = (message) => {
    if (message?.includes('Invalid login credentials')) return 'Invalid email or password';
    if (message?.includes('Email not confirmed')) return 'Please verify your email first';
    if (message?.includes('Too many requests')) return 'Too many attempts. Please try again later';
    return 'Login failed. Please try again.';
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative" style={{ backgroundImage: 'url(/capstonebackground.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-white rounded-lg p-10">
          <div className="flex flex-col items-center mb-8">
            <img src="/capstonelogo.png" alt="DPNHS Logo" style={{ width: '60px', height: '60px' }} />
            <h2 className="text-2xl font-bold mt-4" style={{ color: '#1a2b4a' }}>Student Login</h2>
            <div className="w-10 h-1 mt-2" style={{ backgroundColor: '#d4a843' }} />
            <p className="text-sm mt-2" style={{ color: '#6B7280' }}>Access your student portal</p>
          </div>

          {errorMessage && (
            <div className="flex items-start gap-2 p-3 rounded-md mb-4" style={{ backgroundColor: '#fee2e2' }}>
              <span className="text-red-500 text-lg">⚠</span>
              <p className="text-sm flex-1" style={{ color: '#dc3545' }}>{errorMessage}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div>
              <label className="block text-xs font-semibold tracking-widest mb-2" style={{ color: '#6B7280' }}>EMAIL ADDRESS</label>
              <div className="relative">
                <Mail size={20} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@dpnhs.edu.ph" className="w-full h-12 pl-12 pr-4 rounded-md text-sm outline-none focus:ring-2" style={{ backgroundColor: '#F8F9FA', border: '1px solid #E5E7EB' }} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold tracking-widest mb-2" style={{ color: '#6B7280' }}>PASSWORD</label>
              <div className="relative">
                <Lock size={20} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full h-12 pl-12 pr-12 rounded-md text-sm outline-none focus:ring-2" style={{ backgroundColor: '#F8F9FA', border: '1px solid #E5E7EB' }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2">
                  {showPassword ? <EyeOff size={20} style={{ color: '#9CA3AF' }} /> : <Eye size={20} style={{ color: '#9CA3AF' }} />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button type="button" onClick={() => navigate('/forgot-password')} className="text-sm font-semibold" style={{ color: '#b7950b' }}>Forgot password?</button>
            </div>

            <button type="submit" disabled={isLoading} className="w-full h-12 rounded-md text-white font-semibold text-base hover:opacity-90 transition-opacity disabled:opacity-50" style={{ backgroundColor: '#007bff' }}>
              {isLoading ? <div className="flex items-center justify-center"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /></div> : 'Sign In as Student'}
            </button>
          </form>

          <div className="flex justify-center mt-5">
            <button onClick={() => navigate('/login')} className="text-sm" style={{ color: '#6c757d' }}>← Back to role selection</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentLogin;