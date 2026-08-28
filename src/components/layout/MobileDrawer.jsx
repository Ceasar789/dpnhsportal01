// ============================================
// FILE: src/components/layout/MobileDrawer.jsx
// PURPOSE: Mobile navigation drawer (slide from left)
// DESIGN: Full height, dark overlay, white drawer
// ============================================

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  FileText,
  ClipboardList,
  GraduationCap,
  CalendarCheck,
  Megaphone,
  BookOpen,
  CheckSquare,
  Settings,
  LogOut,
  X
} from 'lucide-react';

const MobileDrawer = ({ role, isOpen, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, userData } = useAuth();

  // Same nav items as Sidebar
  const getNavItems = () => {
    const items = {
      student: [
        { icon: LayoutDashboard, label: 'Overview', path: '/student-dashboard' },
        { icon: ClipboardList, label: 'Assignments', path: '/student-dashboard/assignments' },
        { icon: FileText, label: 'Quizzes', path: '/student-dashboard/quizzes' },
        { icon: CalendarCheck, label: 'Attendance', path: '/student-dashboard/attendance' },
        { icon: Megaphone, label: 'Announcements', path: '/student-dashboard/announcements' },
      ],
      teacher: [
        { icon: LayoutDashboard, label: 'Overview', path: '/teacher-dashboard' },
        { icon: Users, label: 'Students', path: '/teacher-dashboard/students' },
        { icon: BookOpen, label: 'Lesson Plans', path: '/teacher-dashboard/lesson-plans' },
        { icon: FileText, label: 'Worksheets', path: '/teacher-dashboard/worksheets' },
        { icon: GraduationCap, label: 'Grades', path: '/teacher-dashboard/grades' },
        { icon: CalendarCheck, label: 'Attendance', path: '/teacher-dashboard/attendance' },
        { icon: Megaphone, label: 'Announcements', path: '/teacher-dashboard/announcements' },
      ],
      faculty: [
        { icon: LayoutDashboard, label: 'Overview', path: '/faculty-dashboard' },
        { icon: CheckSquare, label: 'Pre-Enrollment', path: '/faculty-dashboard/pre-enrollment' },
      ],
      registrar: [
        { icon: LayoutDashboard, label: 'Overview', path: '/registrar-dashboard' },
        { icon: CheckSquare, label: 'Pre-Enrollment', path: '/registrar-dashboard/pre-enrollment' },
      ],
      main_admin: [
        { icon: LayoutDashboard, label: 'Overview', path: '/admin-dashboard' },
        { icon: Users, label: 'User Management', path: '/admin-dashboard/users' },
        { icon: Megaphone, label: 'News', path: '/admin-dashboard/news' },
        { icon: CalendarCheck, label: 'Calendar', path: '/admin-dashboard/calendar' },
        { icon: FileText, label: 'Memos', path: '/admin-dashboard/memos' },
        { icon: Settings, label: 'Settings', path: '/admin-dashboard/settings' },
      ],
    };
    return items[role] || [];
  };

  const navItems = getNavItems();
  const currentPath = location.pathname;

  const handleNavigate = (path) => {
    navigate(path);
    onClose();
  };

  const handleLogout = async () => {
    await logout();
    onClose();
    navigate('/', { replace: true });
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Dark Overlay */}
      <div 
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed left-0 top-0 bottom-0 w-72 bg-white z-50 flex flex-col">
        
        {/* Header */}
        <div className="p-4 flex items-center justify-between border-b" style={{ backgroundColor: '#0d2b5c', borderColor: '#1a5276' }}>
          <div className="flex items-center gap-3">
            <img src="/capstonelogo.png" alt="Logo" className="w-10 h-10" />
            <span className="text-white font-work font-semibold">
              {role === 'main_admin' ? 'Admin Portal' : 
               role === 'student' ? 'Student Portal' :
               role === 'teacher' ? 'Teacher Portal' :
               role === 'faculty' ? 'Faculty Portal' : 'Registrar Portal'}
            </span>
          </div>
          <button onClick={onClose} className="text-white p-1">
            <X size={24} />
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4">
          {navItems.map((item) => {
            const isActive = currentPath === item.path;
            const Icon = item.icon;
            
            return (
              <button
                key={item.path}
                onClick={() => handleNavigate(item.path)}
                className="w-full flex items-center gap-3 px-6 py-3 text-left"
                style={{
                  backgroundColor: isActive ? 'rgba(13,43,92,0.08)' : 'transparent',
                  color: isActive ? '#0d2b5c' : '#64748B'
                }}
              >
                <Icon size={20} />
                <span className={`font-work text-sm ${isActive ? 'font-bold' : 'font-medium'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t" style={{ borderColor: '#E2E8F0' }}>
          <p className="font-work font-semibold text-sm px-4 mb-1" style={{ color: '#1a2b4a' }}>
            {userData?.name || 'User'}
          </p>
          <p className="text-xs px-4 mb-3" style={{ color: '#94A3B8' }}>
            {userData?.email || ''}
          </p>
          
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-600"
          >
            <LogOut size={20} />
            <span className="font-work font-semibold text-sm">Logout</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default MobileDrawer;