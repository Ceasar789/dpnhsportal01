// ============================================
// FILE: src/components/layout/Sidebar.jsx
// PURPOSE: Desktop sidebar navigation for dashboards
// DESIGN: White sidebar, logo, nav items, logout at bottom
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
  LogOut
} from 'lucide-react';

const Sidebar = ({ role }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, userData } = useAuth();

  // ============================================
  // NAV ITEMS BY ROLE
  // ============================================
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

  // ============================================
  // HANDLE LOGOUT
  // ============================================
  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <aside className="w-64 bg-white h-screen flex flex-col border-r" style={{ borderColor: '#E2E8F0' }}>
      
      {/* Logo Header */}
      <div className="p-6 flex items-center gap-3">
        <img src="/capstonelogo.png" alt="Logo" className="w-10 h-10" />
        <div>
          <h3 className="font-work font-bold text-base" style={{ color: '#1a2b4a' }}>
            {role === 'main_admin' ? 'Admin Portal' : 
             role === 'student' ? 'Student Portal' :
             role === 'teacher' ? 'Teacher Portal' :
             role === 'faculty' ? 'Faculty Portal' : 'Registrar Portal'}
          </h3>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive = currentPath === item.path;
          const Icon = item.icon;
          
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-md mb-1 transition-colors text-left"
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

      {/* User Info + Logout */}
      <div className="p-4 border-t" style={{ borderColor: '#E2E8F0' }}>
        <div className="mb-3 px-4">
          <p className="font-work font-semibold text-sm" style={{ color: '#1a2b4a' }}>
            {userData?.name || 'User'}
          </p>
          <p className="text-xs" style={{ color: '#94A3B8' }}>
            {userData?.email || ''}
          </p>
        </div>
        
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-md text-red-600 hover:bg-red-50 transition-colors text-left"
        >
          <LogOut size={20} />
          <span className="font-work font-semibold text-sm">Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;