import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import { Eye, EyeOff, Mail, Lock, ChevronDown } from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'main_admin', label: 'Admin',      color: '#dc3545', route: '/admin-dashboard' },
  { value: 'teacher',    label: 'Teacher',    color: '#0d2b5c', route: '/teacher-dashboard' },
  { value: 'faculty',    label: 'Faculty',    color: '#6f42c1', route: '/faculty-dashboard' },
  { value: 'registrar',  label: 'Registrar',  color: '#198754', route: '/registrar-dashboard' },
];

const normalizeRole = (role) => {
  if (!role) return 'student';
  const normalized = role.toString().trim().toLowerCase().replace(/ /g, '_');
  if (normalized === 'admin' || normalized === 'main_admin' || normalized === 'main admin') {
    return 'main_admin';
  }
  return normalized;
};
  
const FacultyLogin = () => {
  const navigate = useNavigate();
  const { login, userData, isAuthenticated } = useAuth();

  const [selectedRole, setSelectedRole] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loginAttempted, setLoginAttempted] = useState(false);

  const timeoutRef = useRef(null);
  const selectedRoleRef = useRef(selectedRole);

  useEffect(() => {
    selectedRoleRef.current = selectedRole;
  }, [selectedRole]);

  // FIXED: Redirect already-authenticated faculty/admin users immediately
  useEffect(() => {
    if (isAuthenticated && userData) {
      const normalizedUserRole = normalizeRole(userData.role);
      if (normalizedUserRole !== 'student') {
        const target = ROLE_OPTIONS.find(r => r.value === normalizedUserRole);
        if (target) {
          navigate(target.route, { replace: true });
        }
      }
    }
  }, [isAuthenticated, userData, navigate]);

  useEffect(() => {
    if (!loginAttempted) return;
    if (!userData) return;

    const validateAndRedirect = async () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      const normalizedUserRole = normalizeRole(userData.role);
      const normalizedSelectedRole = normalizeRole(selectedRoleRef.current);

      console.log('🔐 Faculty Portal Role Check:', {
        userRole: userData.role,
        selectedRole: selectedRoleRef.current,
        match: normalizedUserRole === normalizedSelectedRole,
      });

      if (normalizedUserRole === 'student') {
        console.warn('🚫 Security: Blocked STUDENT from Faculty/Admin portal');
        await supabase.auth.signOut();
        setErrorMessage(`❌ Access Denied.\n\nStudents cannot access this portal.\n\nPlease use the STUDENT LOGIN to access your portal.`);
        setIsLoading(false);
        setLoginAttempted(false);
        return;
      }

      if (normalizedUserRole !== normalizedSelectedRole) {
        console.warn(`🚫 Security: Role mismatch - User is ${normalizedUserRole}, selected ${normalizedSelectedRole}`);
        await supabase.auth.signOut();
        setErrorMessage(`❌ Role Mismatch.\n\nYour account is registered as: "${userData.role}"\n\nPlease select the CORRECT role above.`);
        setIsLoading(false);
        setLoginAttempted(false);
        return;
      }

      console.log('✅ Faculty/Admin verified - redirecting to dashboard');
      setErrorMessage('');
      const route = ROLE_OPTIONS.find(r => r.value === normalizedUserRole)?.route || '/faculty-dashboard';
      navigate(route, { replace: true });
    };

    validateAndRedirect();
  }, [userData, loginAttempted, navigate]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!selectedRole) { setErrorMessage('Please select your role'); return; }
    if (!email.trim() || !password) { setErrorMessage('Please fill in all fields'); return; }

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsLoading(true);
    setErrorMessage('');
    setLoginAttempted(true);

    timeoutRef.current = setTimeout(() => {
      setErrorMessage('Login is taking longer than expected. Please wait...');
      setIsLoading(false);
    }, 30000);

    try {
      await login(email, password, selectedRole);
    } catch (error) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      console.error('Login error:', error);
      if (error.message?.startsWith('ROLE_MISMATCH:')) {
        const actualRole = error.actualRole || error.message.split(':')[1];
        setErrorMessage(`❌ Role Mismatch.\n\nYour account is registered as: "${actualRole}"\n\nPlease select the CORRECT role above.`);
      } else {
        setErrorMessage(getErrorMessage(error.message));
      }
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

  const currentRole = ROLE_OPTIONS.find(r => r.value === selectedRole);

  return (
    <div className="min-h-screen flex items-center justify-center relative" style={{ backgroundImage: 'url(/capstonebackground.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-white rounded-lg p-10">
          <div className="flex flex-col items-center mb-8">
            <img src="/capstonelogo.png" alt="DPNHS Logo" style={{ width: '60px', height: '60px' }} />
            <h2 className="text-2xl font-bold mt-4" style={{ color: '#1a2b4a' }}>Faculty Portal</h2>
            <div className="w-10 h-1 mt-2" style={{ backgroundColor: '#d4a843' }} />
            <p className="text-sm mt-2" style={{ color: '#6B7280' }}>Select your role to continue</p>
          </div>

          {errorMessage && (
            <div className="flex items-start gap-2 p-3 rounded-md mb-4" style={{ backgroundColor: '#fee2e2' }}>
              <span className="text-red-500 text-lg">⚠</span>
              <p className="text-sm flex-1" style={{ color: '#dc3545' }}>{errorMessage}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div>
              <label className="block text-xs font-semibold tracking-widest mb-2" style={{ color: '#6B7280' }}>LOGIN AS</label>
              <div className="relative">
                <button type="button" onClick={() => setShowDropdown(!showDropdown)} className="w-full h-12 pl-4 pr-4 rounded-md text-sm text-left flex items-center justify-between outline-none focus:ring-2" style={{ backgroundColor: '#F8F9FA', border: `1px solid ${currentRole ? currentRole.color : '#E5E7EB'}` }}>
                  {currentRole ? (
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: currentRole.color }} />
                      <span className="font-semibold" style={{ color: currentRole.color }}>{currentRole.label}</span>
                    </div>
                  ) : (
                    <span style={{ color: '#9CA3AF' }}>Select your role...</span>
                  )}
                  <ChevronDown size={18} style={{ color: '#9CA3AF', transform: showDropdown ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                </button>
                {showDropdown && (
                  <div className="absolute z-20 w-full mt-1 bg-white rounded-md shadow-lg overflow-hidden" style={{ border: '1px solid #E5E7EB' }}>
                    {ROLE_OPTIONS.map((role) => (
                      <button key={role.value} type="button" onClick={() => { setSelectedRole(role.value); setShowDropdown(false); setErrorMessage(''); }} className="w-full px-4 py-3 text-left text-sm flex items-center gap-3 hover:bg-gray-50 transition-colors">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: role.color }} />
                        <span className="font-semibold" style={{ color: role.color }}>{role.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

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

            <button type="submit" disabled={isLoading} className="w-full h-12 rounded-md text-white font-semibold text-base hover:opacity-90 transition-opacity disabled:opacity-50" style={{ backgroundColor: currentRole?.color || '#0d2b5c' }}>
              {isLoading ? <div className="flex items-center justify-center"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /></div> : `Sign In${currentRole ? ` as ${currentRole.label}` : ''}`}
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

export default FacultyLogin;