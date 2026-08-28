// ============================================
// FILE: src/routes/ProtectedRoute.jsx
// ALREADY CORRECT – kept as is.
// ============================================

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const normalizeRole = (role) => {
  if (!role) return 'student';
  const normalized = role.toString().trim().toLowerCase().replace(/ /g, '_');
  if (normalized === 'admin' || normalized === 'main_admin' || normalized === 'main admin') {
    return 'main_admin';
  }
  return normalized;
};

const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { isAuthenticated, userData, loading } = useAuth();
  const normalizedRole = normalizeRole(userData?.role);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dpnhs-bg">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-dpnhs-navy"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    console.log('🔐 ProtectedRoute: User not authenticated - redirecting to login');
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(normalizedRole)) {
    console.warn(`🚫 ProtectedRoute: Access denied - User role "${normalizedRole}" not in allowed roles [${allowedRoles.join(', ')}]`);
    const roleRoutes = {
      student: '/student-dashboard',
      teacher: '/teacher-dashboard',
      faculty: '/faculty-dashboard',
      registrar: '/registrar-dashboard',
      main_admin: '/admin-dashboard'
    };
    const correctRoute = roleRoutes[normalizedRole];
    if (correctRoute) {
      console.log(`📍 Redirecting to correct dashboard: ${correctRoute}`);
      return <Navigate to={correctRoute} replace />;
    }
    return <Navigate to="/login" replace />;
  }

  console.log(`✅ ProtectedRoute: User (${normalizedRole}) has access`);
  return children;
};

export default ProtectedRoute;