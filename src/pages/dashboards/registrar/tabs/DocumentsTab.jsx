// ============================================
// FILE: src/pages/dashboards/registrar/tabs/DocumentsTab.jsx
// Split from the original monolithic RegistrarDashboard.jsx (2,158 lines)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { Search, Check, X, Upload, Eye, Loader2, Trash2 } from 'lucide-react';
import { Card, Badge, Btn, SectionTitle, PageHeader } from '../shared/ui';
import { STATUS_MAP, DOCUMENT_TYPES } from '../shared/constants';

const DocumentsTab = () => {
  const { userData } = useAuth();
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [documents, setDocuments] = useState([]);
  const [docStats, setDocStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: docs }, { data: stats }] = await Promise.all([
        supabase.from('documents').select('*').order('created_at', { ascending: false }),
        supabase.from('document_stats').select('*')
      ]);
      setDocuments(docs || []);
      setDocStats(stats || []);
    } catch (err) {
      showToast('Error fetching documents', 'error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDocuments();
    const channel = supabase
      .channel('registrar-documents')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, fetchDocuments)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const handleVerify = async (id) => {
    try {
      const { error } = await supabase.from('documents').update({ 
        status: 'verified', 
        verified_at: new Date().toISOString(),
        verified_by: userData?.name || 'Registrar'
      }).eq('id', id);
      if (error) throw error;
      showToast('Document verified');
      fetchDocuments();
    } catch (err) {
      showToast('Error verifying document', 'error');
    }
  };

  const handleReject = async (id) => {
    try {
      const { error } = await supabase.from('documents').update({ 
        status: 'rejected',
        updated_at: new Date().toISOString()
      }).eq('id', id);
      if (error) throw error;
      showToast('Document rejected', 'error');
      fetchDocuments();
    } catch (err) {
      showToast('Error rejecting document', 'error');
    }
  };

  const handleDeleteDoc = async (id) => {
    if (!window.confirm('Delete this document record?')) return;
    try {
      const { error } = await supabase.from('documents').delete().eq('id', id);
      if (error) throw error;
      showToast('Document deleted');
      fetchDocuments();
    } catch (err) {
      showToast('Error deleting document', 'error');
    }
  };

  const statusConfig = {
    verified: { color: '#15803D', bg: '#DCFCE7', label: 'Verified' },
    pending:  { color: '#92400E', bg: '#FEF3C7', label: 'Pending' },
    rejected: { color: '#991B1B', bg: '#FEE2E2', label: 'Rejected' },
  };

  const types = ['all', ...new Set(documents.map(d => d.type).filter(Boolean))];
  const statuses = ['all', 'pending', 'verified', 'rejected'];

  const filteredDocs = documents.filter(d =>
    (filterType === 'all' || d.type === filterType) &&
    (filterStatus === 'all' || d.status === filterStatus) &&
    (d.student_name?.toLowerCase().includes(searchQuery.toLowerCase()) || d.type?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg text-white font-semibold z-50 shadow-lg ${
          toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'
        }`}>{toast.msg}</div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <PageHeader title="Documents" subtitle="Student document repository and verification system" />
        <Btn><Upload size={16} /> Upload Document</Btn>
      </div>

      {/* Category Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {docStats.map(cat => {
          const pct = cat.total > 0 ? Math.round((cat.verified / cat.total) * 100) : 0;
          return (
            <Card key={cat.type} className="p-4">
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--reg-muted)' }}>{cat.type}</p>
              <p className="text-2xl font-bold mb-2" style={{ color: 'var(--reg-text)' }}>{cat.total?.toLocaleString()}</p>
              <div className="h-1.5 rounded-full overflow-hidden mb-1" style={{ backgroundColor: 'var(--reg-border)' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: 'var(--reg-green)' }} />
              </div>
              <p className="text-[10px]" style={{ color: 'var(--reg-muted)' }}>{pct}% verified</p>
            </Card>
          );
        })}
      </div>

      {/* Recent Submissions */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderColor: 'var(--reg-border)' }}>
          <h2 className="text-sm font-bold" style={{ color: 'var(--reg-text)' }}>Recent Submissions</h2>
          <div className="flex gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--reg-muted)' }} />
              <input type="text" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="h-8 pl-8 pr-3 rounded-lg text-xs outline-none"
                style={{ backgroundColor: 'var(--reg-input-bg)', border: '1px solid var(--reg-border)', color: 'var(--reg-text)' }} />
            </div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="h-8 px-2 rounded-lg text-xs outline-none"
              style={{ backgroundColor: 'var(--reg-input-bg)', border: '1px solid var(--reg-border)', color: 'var(--reg-text)' }}>
              {types.map(t => <option key={t} value={t}>{t === 'all' ? 'All Types' : t}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="h-8 px-2 rounded-lg text-xs outline-none"
              style={{ backgroundColor: 'var(--reg-input-bg)', border: '1px solid var(--reg-border)', color: 'var(--reg-text)' }}>
              {statuses.map(s => <option key={s} value={s}>{s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: 'var(--reg-surface-hover)' }}>
                {['Student', 'Document Type', 'Status', 'Date Submitted', 'Verified By', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--reg-muted-light)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-10"><Loader2 className="animate-spin mx-auto" style={{ color: 'var(--reg-muted)' }} /></td></tr>
              ) : filteredDocs.map(d => {
                const sc = statusConfig[d.status] || statusConfig.pending;
                return (
                  <tr key={d.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/30" style={{ borderTop: '1px solid var(--reg-border)' }}>
                    <td className="px-5 py-3.5 text-sm font-medium" style={{ color: 'var(--reg-text)' }}>{d.student_name}</td>
                    <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--reg-muted)' }}>{d.type}</td>
                    <td className="px-5 py-3.5">
                      <Badge color={sc.color} bg={sc.bg}>{sc.label}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--reg-muted)' }}>{new Date(d.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--reg-muted)' }}>{d.verified_by || '—'}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex gap-2">
                        {d.status === 'pending' && (
                          <>
                            <button onClick={() => handleVerify(d.id)} className="p-1.5 rounded-md hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors" style={{ color: 'var(--reg-green)' }} title="Verify">
                              <Check size={14} />
                            </button>
                            <button onClick={() => handleReject(d.id)} className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" style={{ color: 'var(--reg-red)' }} title="Reject">
                              <X size={14} />
                            </button>
                          </>
                        )}
                        <button className="p-1.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" style={{ color: 'var(--reg-blue)' }} title="View">
                          <Eye size={14} />
                        </button>
                        <button onClick={() => handleDeleteDoc(d.id)} className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" style={{ color: 'var(--reg-red)' }} title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filteredDocs.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: 'var(--reg-muted)' }}>No documents found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default DocumentsTab;
