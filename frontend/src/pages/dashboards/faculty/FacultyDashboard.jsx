// ============================================
// FILE: src/pages/dashboards/faculty/FacultyDashboard.jsx
// SHELL: auth guard + DashboardLayout + <Routes>
// Split from the original monolithic FacultyDashboard.jsx (496 lines)
// ============================================

import React, { useEffect } from 'react';
import { useNavigate, Routes, Route } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import PageTransition from '../../../components/PageTransition';
import OverviewTab from './tabs/OverviewTab';
import PreEnrollmentTab from './tabs/PreEnrollmentTab';
import ProfileTab from '../../profile/ProfileTab';

const FacultyDashboard = () => {
  const navigate = useNavigate();
  const { isFaculty } = useAuth();

  useEffect(() => {
    if (!isFaculty()) {
      navigate('/', { replace: true });
    }
  }, [isFaculty, navigate]);

  return (
    <DashboardLayout role="faculty">
      <PageTransition>
        <Routes>
          <Route path="/" element={<OverviewTab />} />
          <Route path="/pre-enrollment" element={<PreEnrollmentTab />} />
          <Route path="/profile" element={<ProfileTab />} />
        </Routes>
      </PageTransition>
    </DashboardLayout>
  );
};

export default FacultyDashboard;
