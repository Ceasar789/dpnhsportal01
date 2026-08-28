// src/components/layout/DashboardLayout.jsx
import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, Users, Newspaper, Calendar, FileText, Settings,
  BookOpen, GraduationCap, ClipboardList, CalendarCheck, Megaphone,
  CheckSquare, LogOut, Menu, ChevronRight, ChevronLeft, Search, Bell
} from 'lucide-react';

const DashboardLayout = ({ role, children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, userData } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getNavItems = () => {
    const items = {
      main_admin: [
        { path: '/admin-dashboard', icon: LayoutDashboard, label: 'Overview' },
        { path: '/admin-dashboard/users', icon: Users, label: 'User Management' },
        { path: '/admin-dashboard/news', icon: Newspaper, label: 'News' },
        { path: '/admin-dashboard/calendar', icon: Calendar, label: 'Calendar' },
        { path: '/admin-dashboard/memos', icon: FileText, label: 'Memos' },
        { path: '/admin-dashboard/settings', icon: Settings, label: 'Settings' },
      ],
      teacher: [
        { path: '/teacher-dashboard', icon: LayoutDashboard, label: 'Overview' },
        { path: '/teacher-dashboard/students', icon: Users, label: 'Students' },
        { path: '/teacher-dashboard/lesson-plans', icon: BookOpen, label: 'Lesson Plans' },
        { path: '/teacher-dashboard/worksheets', icon: ClipboardList, label: 'Worksheets' },
        { path: '/teacher-dashboard/grades', icon: GraduationCap, label: 'Grades' },
        { path: '/teacher-dashboard/attendance', icon: CalendarCheck, label: 'Attendance' },
        { path: '/teacher-dashboard/announcements', icon: Megaphone, label: 'Announcements' },
      ],
      student: [
        { path: '/student-dashboard', icon: LayoutDashboard, label: 'Overview' },
        { path: '/student-dashboard/assignments', icon: ClipboardList, label: 'Assignments' },
        { path: '/student-dashboard/quizzes', icon: FileText, label: 'Quizzes' },
        { path: '/student-dashboard/attendance', icon: CalendarCheck, label: 'Attendance' },
        { path: '/student-dashboard/announcements', icon: Megaphone, label: 'Announcements' },
      ],
      faculty: [
        { path: '/faculty-dashboard', icon: LayoutDashboard, label: 'Overview' },
        { path: '/faculty-dashboard/pre-enrollment', icon: CheckSquare, label: 'Pre-Enrollment' },
      ],
      registrar: [
        { path: '/registrar-dashboard', icon: LayoutDashboard, label: 'Overview' },
        { path: '/registrar-dashboard/pre-enrollment', icon: CheckSquare, label: 'Pre-Enrollment' },
      ],
    };
    return items[role] || [];
  };

  const navItems = getNavItems();
  const roleLabels = {
    main_admin: 'Administrator',
    teacher: 'Teacher',
    student: 'Student',
    faculty: 'Faculty',
    registrar: 'Registrar'
  };
  const portalLabels = {
    main_admin: 'Admin Portal',
    teacher: 'Teacher Portal',
    student: 'Student Portal',
    faculty: 'Faculty Portal',
    registrar: 'Registrar Portal'
  };

  const borderColor = '#e2e8f0';
  const activeBg = '#eef0f5';
  const brandGradient = 'linear-gradient(100deg,#12069f 0%,#1908DF 55%,#3a2bf0 100%)';

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#f1f5f9]">
      {/* ===== HEADER ===== */}
      <header className="flex items-center gap-4 px-4 sm:px-5 py-3 flex-shrink-0 shadow-sm z-30" style={{ background: brandGradient }}>
        <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-full text-white/90 hover:bg-white/10 transition-colors flex-shrink-0">
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
          <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex-shrink-0 overflow-hidden">
            <img src="/capstonelogo.png" alt="School Logo" className="w-full h-full object-contain"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
          <div className="hidden sm:block leading-tight">
            <h1 className="font-work font-extrabold text-xl tracking-wide">
              <span style={{ color: '#F1CA0B' }}>EDU</span><span style={{ color: '#31F745' }}>SCRIBE</span>
            </h1>
            <p className="text-[11px] text-white/70 font-medium">{portalLabels[role] || 'Dashboard'}</p>
          </div>
        </div>

        <div className="flex-1 hidden md:flex justify-center">
          <div className="w-full max-w-md flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-sm">
            <Search size={15} className="text-slate-400 flex-shrink-0" />
            <input
              type="text"
              placeholder="Search..."
              className="bg-transparent outline-none text-sm w-full text-slate-700 placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto md:ml-0">
          <button className="w-9 h-9 rounded-full flex items-center justify-center text-white/90 bg-white/10 hover:bg-white/20 transition-colors relative">
            <Bell size={16} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* ===== SIDEBAR ===== */}
        <aside
          className={`
            fixed lg:static inset-y-0 left-0 z-50 flex flex-col flex-shrink-0 bg-white
            transform transition-all duration-300 ease-in-out shadow-sm
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            ${sidebarCollapsed ? 'lg:w-20' : 'w-64'}
          `}
          style={{ borderRight: `1px solid ${borderColor}` }}
        >
          <button
            onClick={() => setSidebarCollapsed(c => !c)}
            className="hidden lg:flex absolute -right-3 top-7 w-6 h-6 rounded-full items-center justify-center shadow-md z-10 bg-white text-slate-500"
            style={{ border: `1px solid ${borderColor}` }}
          >
            {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </button>

          <div className="p-5 flex items-center gap-3 border-b" style={{ borderColor }}>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
              style={{ backgroundColor: '#FFC542', color: '#12069f' }}
            >
              {(userData?.name || 'U')[0].toUpperCase()}
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <p className="text-sm font-bold truncate text-[#1a2b4a]">{userData?.name || 'User'}</p>
                <p className="text-[11px] text-slate-500">{roleLabels[role] || role}</p>
              </div>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto py-4 px-3">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all mb-1 ${sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''}`}
                  style={{
                    backgroundColor: isActive ? activeBg : 'transparent',
                    color: isActive ? '#1908DF' : '#64748b',
                  }}
                >
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
                    style={{
                      backgroundColor: isActive ? '#ffffff' : 'transparent',
                      border: isActive ? 'none' : `1px solid ${borderColor}`,
                      boxShadow: isActive ? '0 2px 6px rgba(25,8,223,.18)' : 'none',
                    }}
                  >
                    <Icon size={16} />
                  </span>
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t" style={{ borderColor }}>
            <button
              onClick={handleLogout}
              className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors border ${sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''}`}
              style={{ color: '#dc2626', borderColor: '#f3b9ba', backgroundColor: '#fdf1f1' }}
            >
              <LogOut size={16} />
              {!sidebarCollapsed && <span>Logout</span>}
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto min-w-0 bg-white">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
