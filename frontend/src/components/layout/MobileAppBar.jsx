// ============================================
// FILE: src/components/layout/MobileAppBar.jsx
// PURPOSE: Top app bar for mobile dashboards
// DESIGN: Navy background, logo, menu button, profile menu
// ============================================

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Menu, User, Lock, LogOut } from 'lucide-react';

const MobileAppBar = ({ role, onMenuClick }) => {
  const navigate = useNavigate();
  const { logout, userData } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const portalTitle = {
    student: 'Student Portal',
    teacher: 'Teacher Portal',
    faculty: 'Faculty Portal',
    registrar: 'Registrar Portal',
    main_admin: 'Admin Portal'
  }[role] || 'Portal';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-4" style={{ backgroundColor: '#0d2b5c' }}>
      
      {/* Left: Menu + Logo */}
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick} className="text-white p-1">
          <Menu size={24} />
        </button>
        <img src="/capstonelogo.png" alt="Logo" className="w-8 h-8" />
        <span className="text-white font-work font-semibold text-lg">
          {portalTitle}
        </span>
      </div>

      {/* Right: Profile Menu */}
      <div className="relative">
        <button 
          onClick={() => setMenuOpen(!menuOpen)}
          className="text-white p-1"
        >
          <User size={28} />
        </button>

        {/* Dropdown */}
        {menuOpen && (
          <div className="absolute right-0 top-12 w-56 bg-white rounded-lg shadow-lg border py-2" style={{ borderColor: '#E2E8F0' }}>
            {/* User Info */}
            <div className="px-4 py-3 border-b" style={{ borderColor: '#E2E8F0' }}>
              <p className="font-work font-semibold text-sm" style={{ color: '#1a2b4a' }}>
                {userData?.name || 'User'}
              </p>
              <p className="text-xs" style={{ color: '#94A3B8' }}>
                {userData?.email || ''}
              </p>
            </div>

            {/* Menu Items */}
            <button
              onClick={() => {
                navigate('/change-password');
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 text-left"
            >
              <Lock size={18} />
              <span className="text-sm">Change Password</span>
            </button>

            <button
              onClick={() => {
                handleLogout();
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-red-50 text-left text-red-600"
            >
              <LogOut size={18} />
              <span className="text-sm font-semibold">Logout</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default MobileAppBar;