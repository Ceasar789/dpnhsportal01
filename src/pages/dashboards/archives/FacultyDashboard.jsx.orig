// ============================================
// FILE: src/pages/dashboards/FacultyDashboard.jsx
// UPDATED: Full Supabase CRUD + Real-time Pre-enrollment
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Routes, Route } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import DashboardLayout from '../../components/layout/DashboardLayout';
import {
  CheckSquare, Search, FileCheck, X, Check, AlertCircle,
  Plus, Eye, Filter, Save, Loader2
} from 'lucide-react';

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
      <Routes>
        <Route path="/" element={<FacultyOverviewTab />} />
        <Route path="/pre-enrollment" element={<FacultyPreEnrollmentTab />} />
      </Routes>
    </DashboardLayout>
  );
};

// ============================================
// FACULTY OVERVIEW TAB — Live stats from Supabase
// ============================================
const FacultyOverviewTab = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    pendingChecklists: 0,
    completedToday: 0,
    totalProcessed: 0,
    documentsMissing: 0
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];
    
    const { data: pending } = await supabase
      .from('pre_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    
    const { data: completed } = await supabase
      .from('pre_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')
      .gte('updated_at', today);
    
    const { data: total } = await supabase
      .from('pre_enrollments')
      .select('*', { count: 'exact', head: true });
    
    const { data: missing } = await supabase
      .from('pre_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'incomplete');

    setStats({
      pendingChecklists: pending?.length || 0,
      completedToday: completed?.length || 0,
      totalProcessed: total?.length || 0,
      documentsMissing: missing?.length || 0
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStats();
    
    // Real-time updates
    const channel = supabase
      .channel('faculty-stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pre_enrollments' }, () => {
        fetchStats();
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="font-work font-bold text-2xl text-[#1a2b4a] mb-6">Faculty Overview</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Pending Checklists" value={stats.pendingChecklists} icon={CheckSquare} color="#DC2626" loading={loading} />
        <StatCard title="Completed Today" value={stats.completedToday} icon={Check} color="#059669" loading={loading} />
        <StatCard title="Total Processed" value={stats.totalProcessed} icon={FileCheck} color="#0d2b5c" loading={loading} />
        <StatCard title="Missing Documents" value={stats.documentsMissing} icon={AlertCircle} color="#F59E0B" loading={loading} />
      </div>

      <div className="bg-white rounded-lg border p-6" style={{ borderColor: '#E2E8F0' }}>
        <h2 className="font-work font-bold text-lg text-[#1a2b4a] mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <QuickActionButton 
            icon={Plus} 
            label="Check Pre-Enrollment" 
            onClick={() => navigate('/faculty-dashboard/pre-enrollment')} 
            color="#0d2b5c" 
          />
          <QuickActionButton 
            icon={Filter} 
            label="Filter by Status" 
            onClick={() => navigate('/faculty-dashboard/pre-enrollment')} 
            color="#2563EB" 
          />
        </div>
      </div>
    </div>
  );
};

// ============================================
// PRE-ENROLLMENT TAB — Full Supabase CRUD
// ============================================
const FacultyPreEnrollmentTab = () => {
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedEnrollment, setSelectedEnrollment] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Document labels mapping
  const documentLabels = {
    birthCertificate: 'PSA Birth Certificate',
    reportCard: 'Form 138 (Report Card)',
    goodMoral: 'Certificate of Good Moral',
    idPictures: '2x2 ID Pictures (2 copies)',
    certificateCompletion: 'Certificate of Completion'
  };

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    incomplete: 'bg-orange-100 text-orange-700'
  };

  const fetchEnrollments = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('pre_enrollments')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      showToast('Error loading enrollments: ' + error.message, 'error');
    } else {
      setEnrollments(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEnrollments();
    
    // Real-time subscription
    const channel = supabase
      .channel('faculty-pre-enrollment')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pre_enrollments' }, (payload) => {
        if (payload.eventType === 'UPDATE' && selectedEnrollment?.id === payload.new.id) {
          setSelectedEnrollment(payload.new);
        }
        fetchEnrollments();
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const handleCheckDocument = async (enrollmentId, docKey) => {
    const enrollment = enrollments.find(e => e.id === enrollmentId);
    if (!enrollment) return;

    const newDocs = { ...enrollment.documents, [docKey]: !enrollment.documents[docKey] };
    const allComplete = Object.values(newDocs).every(v => v);
    const newStatus = allComplete ? 'approved' : enrollment.status === 'approved' ? 'pending' : enrollment.status;

    setSaving(true);
    const { error } = await supabase
      .from('pre_enrollments')
      .update({
        documents: newDocs,
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', enrollmentId);

    if (error) {
      showToast('Error updating document: ' + error.message, 'error');
    } else {
      showToast(`${documentLabels[docKey]} marked as ${newDocs[docKey] ? 'received' : 'missing'}`);
      await fetchEnrollments();
    }
    setSaving(false);
  };

  const handleApprove = async (id) => {
    const enrollment = enrollments.find(e => e.id === id);
    const allComplete = Object.values(enrollment.documents).every(v => v);
    if (!allComplete) {
      showToast('All documents must be checked before approving', 'error');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('pre_enrollments')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      showToast('Error approving: ' + error.message, 'error');
    } else {
      showToast('Enrollment approved!');
      await fetchEnrollments();
    }
    setSaving(false);
  };

  const handleReject = async (id) => {
    if (!confirm('Are you sure you want to reject this enrollment?')) return;
    
    setSaving(true);
    const { error } = await supabase
      .from('pre_enrollments')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      showToast('Error rejecting: ' + error.message, 'error');
    } else {
      showToast('Enrollment rejected');
      await fetchEnrollments();
    }
    setSaving(false);
  };

  const filteredEnrollments = enrollments.filter(e => {
    const matchesSearch = e.student_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         e.parent_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || e.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg text-white font-semibold z-50 ${
          toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="font-work font-bold text-2xl text-[#1a2b4a] mb-1">Pre-Enrollment Checklist</h1>
          <p className="text-sm text-[#64748B]">Verify student documents</p>
        </div>
        {saving && <Loader2 className="animate-spin text-blue-500" size={24} />}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            placeholder="Search students..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
            style={{ backgroundColor: '#F8F9FA', border: '1px solid #E5E7EB' }}
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-11 px-4 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
          style={{ backgroundColor: '#F8F9FA', border: '1px solid #E5E7EB' }}
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="incomplete">Incomplete</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Enrollments Table */}
      <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
        <table className="w-full">
          <thead style={{ backgroundColor: '#F8F9FA' }}>
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold tracking-wider text-[#64748B] uppercase">Student</th>
              <th className="px-6 py-4 text-left text-xs font-semibold tracking-wider text-[#64748B] uppercase">Parent</th>
              <th className="px-6 py-4 text-left text-xs font-semibold tracking-wider text-[#64748B] uppercase">Grade</th>
              <th className="px-6 py-4 text-left text-xs font-semibold tracking-wider text-[#64748B] uppercase">Documents</th>
              <th className="px-6 py-4 text-left text-xs font-semibold tracking-wider text-[#64748B] uppercase">Status</th>
              <th className="px-6 py-4 text-right text-xs font-semibold tracking-wider text-[#64748B] uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: '#E2E8F0' }}>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-10"><Loader2 className="animate-spin mx-auto text-blue-500" /></td></tr>
            ) : filteredEnrollments.map((enrollment) => {
              const completedDocs = Object.values(enrollment.documents || {}).filter(Boolean).length;
              const totalDocs = Object.keys(documentLabels).length;
              
              return (
                <tr key={enrollment.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <p className="font-semibold text-sm text-[#1a2b4a]">{enrollment.student_name}</p>
                    <p className="text-xs text-[#94A3B8]">Submitted {new Date(enrollment.created_at).toLocaleDateString()}</p>
                  </td>
                  <td className="px-6 py-4 text-sm text-[#64748B]">{enrollment.parent_name}</td>
                  <td className="px-6 py-4 text-sm text-[#64748B]">Grade {enrollment.grade_level}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden w-24">
                        <div 
                          className="h-full rounded-full bg-blue-500 transition-all"
                          style={{ width: `${(completedDocs/totalDocs)*100}%` }}
                        />
                      </div>
                      <span className="text-xs text-[#64748B]">{completedDocs}/{totalDocs}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${statusColors[enrollment.status] || statusColors.pending}`}>
                      {enrollment.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex gap-2 justify-end">
                      <button 
                        onClick={() => {
                          setSelectedEnrollment(enrollment);
                          setShowDetailModal(true);
                        }}
                        className="p-2 hover:bg-blue-50 rounded-md transition-colors"
                      >
                        <Eye size={18} className="text-blue-600" />
                      </button>
                      {enrollment.status !== 'approved' && (
                        <button 
                          onClick={() => handleApprove(enrollment.id)}
                          className="p-2 hover:bg-green-50 rounded-md transition-colors"
                          title="Approve"
                        >
                          <Check size={18} className="text-green-600" />
                        </button>
                      )}
                      {enrollment.status !== 'rejected' && (
                        <button 
                          onClick={() => handleReject(enrollment.id)}
                          className="p-2 hover:bg-red-50 rounded-md transition-colors"
                          title="Reject"
                        >
                          <X size={18} className="text-red-600" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && filteredEnrollments.length === 0 && (
              <tr><td colSpan={6} className="text-center py-10 text-[#94A3B8]">No enrollments found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedEnrollment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: '#E2E8F0' }}>
              <div>
                <h2 className="font-work font-bold text-xl text-[#1a2b4a]">Document Checklist</h2>
                <p className="text-sm text-[#64748B]">{selectedEnrollment.student_name} - Grade {selectedEnrollment.grade_level}</p>
              </div>
              <button 
                onClick={() => setShowDetailModal(false)}
                className="p-1 hover:bg-gray-100 rounded-md"
              >
                <X size={24} className="text-[#64748B]" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="space-y-3">
                {Object.entries(documentLabels).map(([key, label]) => (
                  <div 
                    key={key}
                    onClick={() => !saving && handleCheckDocument(selectedEnrollment.id, key)}
                    className={`flex items-center gap-3 p-4 rounded-lg cursor-pointer transition-colors ${
                      selectedEnrollment.documents?.[key] ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      selectedEnrollment.documents?.[key] ? 'bg-green-500' : 'bg-gray-300'
                    }`}>
                      {selectedEnrollment.documents?.[key] && <Check size={14} className="text-white" />}
                    </div>
                    <span className={`text-sm font-medium ${
                      selectedEnrollment.documents?.[key] ? 'text-green-700' : 'text-[#64748B]'
                    }`}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => handleApprove(selectedEnrollment.id)}
                  disabled={saving}
                  className="flex-1 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="animate-spin mx-auto" size={18} /> : 'Approve All'}
                </button>
                <button
                  onClick={() => handleReject(selectedEnrollment.id)}
                  disabled={saving}
                  className="flex-1 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  Reject
                </button>
              </div>

              <div className="mt-4 p-4 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-sm text-blue-800">
                  <span className="font-semibold">Tip:</span> Click on each document to mark it as received. All documents must be checked to approve the enrollment.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Reusable components
const StatCard = ({ title, value, icon: Icon, color, loading }) => (
  <div className="bg-white rounded-lg border p-6" style={{ borderColor: '#E2E8F0' }}>
    <div className="flex items-start justify-between mb-4">
      <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
        <Icon size={24} style={{ color }} />
      </div>
      {loading && <Loader2 className="animate-spin text-gray-400" size={16} />}
    </div>
    <p className="text-3xl font-bold text-[#1a2b4a] mb-1">{loading ? '—' : value}</p>
    <p className="text-sm text-[#64748B]">{title}</p>
  </div>
);

const QuickActionButton = ({ icon: Icon, label, onClick, color }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-3 px-5 py-4 rounded-lg border hover:shadow-md transition-all text-left"
    style={{ borderColor: '#E2E8F0', backgroundColor: 'white' }}
  >
    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
      <Icon size={20} style={{ color }} />
    </div>
    <span className="font-work font-semibold text-sm text-[#1a2b4a]">{label}</span>
  </button>
);

export default FacultyDashboard;