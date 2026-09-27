import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import { Eye, EyeOff, Mail, Lock, ChevronDown, AlertTriangle } from 'lucide-react';
import FlippingLogo from '../../components/FlippingLogo';

const ROLE_OPTIONS = [
  { value: 'main_admin', label: 'Admin',      color: '#b91c1c', route: '/admin-dashboard' },
  { value: 'teacher',    label: 'Teacher',    color: '#0d2b5c', route: '/teacher-dashboard' },
  { value: 'faculty',    label: 'Faculty',    color: '#6f42c1', route: '/faculty-dashboard' },
  { value: 'registrar',  label: 'Registrar',  color: '#157347', route: '/registrar-dashboard' },
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
  const { login, userData } = useAuth();

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
  const roleFieldRef = useRef(null);

  useEffect(() => {
    selectedRoleRef.current = selectedRole;
  }, [selectedRole]);

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
        setErrorMessage(`Access denied.\n\nStudents cannot access this portal.\n\nPlease use the STUDENT LOGIN to access your portal.`);
        setIsLoading(false);
        setLoginAttempted(false);
        return;
      }

      if (normalizedUserRole !== normalizedSelectedRole) {
        console.warn(`🚫 Security: Role mismatch - User is ${normalizedUserRole}, selected ${normalizedSelectedRole}`);
        await supabase.auth.signOut();
        setErrorMessage(`Role mismatch.\n\nYour account is registered as: "${userData.role}"\n\nPlease select the CORRECT role above.`);
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

  // The role list sits over the email field, so it has to be dismissable
  // without choosing a role.
  useEffect(() => {
    if (!showDropdown) return;
    const onPointer = (e) => {
      if (!roleFieldRef.current?.contains(e.target)) setShowDropdown(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setShowDropdown(false);
        roleFieldRef.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [showDropdown]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!selectedRole) { setErrorMessage('Please select your role'); return; }
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
    }, 30000);

    try {
      await login(email, password, selectedRole);
    } catch (error) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      console.error('Login error:', error);
      if (error.message?.startsWith('ROLE_MISMATCH:')) {
        const actualRole = error.actualRole || error.message.split(':')[1];
        setErrorMessage(`Role mismatch.\n\nYour account is registered as: "${actualRole}"\n\nPlease select the CORRECT role above.`);
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
            <FlippingLogo size={60} />
            <h1 className="text-2xl font-bold mt-4" style={{ color: '#1a2b4a' }}>Faculty Portal</h1>
            <div className="w-10 h-1 mt-2" style={{ backgroundColor: '#d4a843' }} />
            <p className="text-sm mt-2" style={{ color: '#6B7280' }}>Select your role to continue</p>
          </div>

          {errorMessage && (
            <div role="alert" className="flex items-start gap-2 p-3 rounded-md mb-4" style={{ backgroundColor: '#fee2e2' }}>
              <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: '#b91c1c' }} aria-hidden="true" />
              <p className="text-sm flex-1 whitespace-pre-line" style={{ color: '#b91c1c' }}>{errorMessage}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div>
              <span id="login-as-label" className="block text-xs font-semibold tracking-widest mb-2" style={{ color: '#6B7280' }}>LOGIN AS</span>
              <div className="relative" ref={roleFieldRef}>
                <button type="button" id="role-trigger" aria-labelledby="login-as-label role-trigger" aria-haspopup="listbox" aria-expanded={showDropdown} onClick={() => setShowDropdown(!showDropdown)} className="w-full h-12 pl-4 pr-4 rounded-md text-sm text-left flex items-center justify-between outline-none focus:ring-2" style={{ backgroundColor: '#F8F9FA', border: `1px solid ${currentRole ? currentRole.color : '#E5E7EB'}` }}>
                  {currentRole ? (
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: currentRole.color }} aria-hidden="true" />
                      <span className="font-semibold" style={{ color: currentRole.color }}>{currentRole.label}</span>
                    </div>
                  ) : (
                    <span style={{ color: '#64748b' }}>Select your role...</span>
                  )}
                  <ChevronDown size={18} aria-hidden="true" style={{ color: '#64748b', transform: showDropdown ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                </button>
                {showDropdown && (
                  <div role="listbox" aria-labelledby="login-as-label" className="absolute z-20 w-full mt-1 bg-white rounded-md shadow-lg overflow-hidden" style={{ border: '1px solid #E5E7EB' }}>
                    {ROLE_OPTIONS.map((role) => (
                      <button key={role.value} type="button" role="option" aria-selected={role.value === selectedRole} onClick={() => { setSelectedRole(role.value); setShowDropdown(false); setErrorMessage(''); }} className="w-full px-4 py-3 text-left text-sm flex items-center gap-3 hover:bg-gray-50 transition-colors">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: role.color }} aria-hidden="true" />
                        <span className="font-semibold" style={{ color: role.color }}>{role.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="faculty-email" className="block text-xs font-semibold tracking-widest mb-2" style={{ color: '#6B7280' }}>EMAIL ADDRESS</label>
              <div className="relative">
                <Mail size={20} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#64748b' }} aria-hidden="true" />
                <input id="faculty-email" name="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@dpnhs.edu.ph" className="w-full h-12 pl-12 pr-4 rounded-md text-sm outline-none focus:ring-2 placeholder:text-[#64748b]" style={{ backgroundColor: '#F8F9FA', border: '1px solid #E5E7EB' }} />
              </div>
            </div>

            <div>
              <label htmlFor="faculty-password" className="block text-xs font-semibold tracking-widest mb-2" style={{ color: '#6B7280' }}>PASSWORD</label>
              <div className="relative">
                <Lock size={20} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#64748b' }} aria-hidden="true" />
                <input id="faculty-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full h-12 pl-12 pr-12 rounded-md text-sm outline-none focus:ring-2 placeholder:text-[#64748b]" style={{ backgroundColor: '#F8F9FA', border: '1px solid #E5E7EB' }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded">
                  {showPassword ? <EyeOff size={20} style={{ color: '#64748b' }} aria-hidden="true" /> : <Eye size={20} style={{ color: '#64748b' }} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-sm font-semibold py-1.5 px-1 -mr-1 rounded" style={{ color: '#7E5700' }}>Forgot password?</Link>
            </div>

            <button type="submit" disabled={isLoading} aria-busy={isLoading} className="w-full h-12 rounded-md text-white font-semibold text-base hover:opacity-90 transition-opacity disabled:opacity-50" style={{ backgroundColor: currentRole?.color || '#0d2b5c' }}>
              {isLoading ? <div className="flex items-center justify-center"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" /><span className="sr-only">Signing in</span></div> : `Sign In${currentRole ? ` as ${currentRole.label}` : ''}`}
            </button>
          </form>

          <div className="flex justify-center mt-5">
            <Link to="/login" className="text-sm py-1.5 px-2 rounded" style={{ color: '#6c757d' }}>← Back to role selection</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FacultyLogin;