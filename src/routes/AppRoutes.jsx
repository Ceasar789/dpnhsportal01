// No need to import React explicitly if using React 17+ (new JSX transform)
// But if your environment requires it, keep one import – no duplicates.
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';  // ✅ fixed path (moved up one level)
import ProtectedRoute from './ProtectedRoute';
import PageTransition from '../components/PageTransition';

// Public Pages
import Home     from '../pages/public/Home';
import News     from '../pages/public/News';
import Calendar from '../pages/public/Calendar';
import Login    from '../pages/public/Login';

// Auth Pages
import StudentLogin   from '../pages/auth/StudentLogin';
import FacultyLogin   from '../pages/auth/FacultyLogin';
import ForgotPassword from '../pages/auth/ForgotPassword';
import ResetPassword  from '../pages/auth/ResetPassword';
import ChangePassword from '../pages/auth/ChangePassword';
import VerifyEmail    from '../pages/auth/VerifyEmail';

// Dashboard Pages
import StudentDashboard   from '../pages/dashboards/student/StudentDashboard';
import TeacherDashboard   from '../pages/dashboards/teacher/TeacherDashboard';
import FacultyDashboard   from '../pages/dashboards/faculty/FacultyDashboard';
import RegistrarDashboard from '../pages/dashboards/registrar/RegistrarDashboard';
import AdminDashboard     from '../pages/dashboards/admin/AdminDashboard';

const AppRoutes = () => {
  return (
    <AuthProvider>
      <Routes>
        {/* PUBLIC ROUTES */}
        <Route path="/"         element={<PageTransition><Home /></PageTransition>} />
        <Route path="/news"     element={<PageTransition><News /></PageTransition>} />
        <Route path="/calendar" element={<PageTransition><Calendar /></PageTransition>} />
        <Route path="/login"    element={<PageTransition><Login /></PageTransition>} />

        {/* AUTH ROUTES */}
        <Route path="/student-login"   element={<PageTransition><StudentLogin /></PageTransition>} />
        <Route path="/faculty-login"   element={<PageTransition><FacultyLogin /></PageTransition>} />
        <Route path="/forgot-password" element={<PageTransition><ForgotPassword /></PageTransition>} />
        <Route path="/reset-password"  element={<PageTransition><ResetPassword /></PageTransition>} />
        <Route path="/verify-email"    element={<PageTransition><VerifyEmail /></PageTransition>} />

        {/* PROTECTED */}
        <Route path="/change-password" element={
          <ProtectedRoute><PageTransition><ChangePassword /></PageTransition></ProtectedRoute>
        } />

        {/* DASHBOARDS */}
        <Route path="/student-dashboard/*" element={
          <ProtectedRoute allowedRoles={['student']}><StudentDashboard /></ProtectedRoute>
        } />
        <Route path="/teacher-dashboard/*" element={
          <ProtectedRoute allowedRoles={['teacher']}><TeacherDashboard /></ProtectedRoute>
        } />
        <Route path="/faculty-dashboard/*" element={
          <ProtectedRoute allowedRoles={['faculty']}><FacultyDashboard /></ProtectedRoute>
        } />
        <Route path="/registrar-dashboard/*" element={
          <ProtectedRoute allowedRoles={['registrar']}><RegistrarDashboard /></ProtectedRoute>
        } />
        <Route path="/admin-dashboard/*" element={
          <ProtectedRoute allowedRoles={['main_admin']}><AdminDashboard /></ProtectedRoute>
        } />

        {/* 404 */}
        <Route path="*" element={
          <div className="min-h-screen flex items-center justify-center bg-dpnhs-bg">
            <div className="text-center">
              <h1 className="text-6xl font-bold text-dpnhs-navy mb-4">404</h1>
              <p className="text-dpnhs-gray mb-6">Page not found</p>
              <a href="/" className="text-dpnhs-gold font-semibold hover:underline">Return to Home</a>
            </div>
          </div>
        } />
      </Routes>
    </AuthProvider>
  );
};

export default AppRoutes;