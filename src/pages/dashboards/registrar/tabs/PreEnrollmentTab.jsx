// ============================================
// FILE: src/pages/dashboards/registrar/tabs/PreEnrollmentTab.jsx
// Split from the original monolithic RegistrarDashboard.jsx (2,158 lines)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { Search, Check, X, RotateCcw, Loader2, School } from 'lucide-react';
import { Card, Badge, Btn, SectionTitle, PageHeader } from '../shared/ui';
import { STATUS_MAP, DOCUMENT_TYPES } from '../shared/constants';

const PreEnrollmentTab = () => {
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchEnrollments = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pre_enrollments')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setEnrollments(data || []);
      if (data?.length && !selected) setSelected(data[0]);
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEnrollments();
    const channel = supabase
      .channel('registrar-pre-enrollment')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pre_enrollments' }, (payload) => {
        if (payload.eventType === 'UPDATE' && selected?.id === payload.new.id) {
          setSelected(payload.new);
        }
        fetchEnrollments();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const toggleDoc = async (docKey) => {
    if (!selected || saving) return;

    const currentDocs = selected.documents || {};
    const newDocs = { ...currentDocs, [docKey]: !currentDocs[docKey] };
    const allDone = Object.values(newDocs).every(d => d);
    const newStatus = allDone ? 'approved' : (selected.status === 'approved' ? 'pending' : selected.status);

    setSaving(true);
    try {
      const { error } = await supabase
        .from('pre_enrollments')
        .update({ documents: newDocs, status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', selected.id);

      if (error) throw error;

      showToast(`${DOCUMENT_TYPES.find(d => d.key === docKey)?.label || docKey} marked as ${newDocs[docKey] ? 'received' : 'missing'}`);
      await fetchEnrollments();
    } catch (err) {
      showToast('Error updating document', 'error');
    }
    setSaving(false);
  };

  const handleApprove = async () => {
    if (!selected) return;
    const allDone = Object.values(selected.documents || {}).every(d => d);
    if (!allDone) { 
      showToast('All documents must be checked before approving', 'error'); 
      return; 
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('pre_enrollments')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', selected.id);

      if (error) throw error;

      showToast('Enrollment approved successfully!');

      await supabase.from('notifications').insert([{
        user_id: selected.student_id,
        title: 'Enrollment Approved',
        message: 'Your pre-enrollment has been approved. Welcome to Dela Paz National High School!',
        type: 'success',
        created_at: new Date().toISOString()
      }]);

      await supabase.from('activity_logs').insert([{
        action: 'Approved pre-enrollment',
        user_name: selected.student_name,
        details: `Student ${selected.student_name} enrollment approved`,
        created_at: new Date().toISOString()
      }]);

      await fetchEnrollments();
    } catch (err) {
      showToast('Error approving enrollment', 'error');
    }
    setSaving(false);
  };

  const handleReturn = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('pre_enrollments')
        .update({ status: 'incomplete', notes: noteText, updated_at: new Date().toISOString() })
        .eq('id', selected.id);

      if (error) throw error;

      showToast('Application returned for revision');

      await supabase.from('notifications').insert([{
        user_id: selected.student_id,
        title: 'Enrollment Needs Revision',
        message: noteText || 'Your enrollment application needs additional documents or corrections.',
        type: 'warning',
        created_at: new Date().toISOString()
      }]);

      await supabase.from('activity_logs').insert([{
        action: 'Returned enrollment for revision',
        user_name: selected.student_name,
        details: noteText,
        created_at: new Date().toISOString()
      }]);

      setNoteText('');
      await fetchEnrollments();
    } catch (err) {
      showToast('Error returning application', 'error');
    }
    setSaving(false);
  };

  const handleReject = async () => {
    if (!selected) return;
    if (!window.confirm('Are you sure you want to reject this application?')) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('pre_enrollments')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', selected.id);

      if (error) throw error;

      showToast('Application rejected', 'error');

      await supabase.from('notifications').insert([{
        user_id: selected.student_id,
        title: 'Enrollment Rejected',
        message: 'Your enrollment application has been rejected. Please contact the registrar office.',
        type: 'error',
        created_at: new Date().toISOString()
      }]);

      await fetchEnrollments();
    } catch (err) {
      showToast('Error rejecting application', 'error');
    }
    setSaving(false);
  };

  const filtered = enrollments.filter(e => {
    const q = searchQuery.toLowerCase();
    return (
      (!q || e.student_name?.toLowerCase().includes(q) || e.student_no?.includes(q)) &&
      (filterStatus === 'all' || e.status === filterStatus)
    );
  });

  const selDocs = selected ? Object.entries(selected.documents || {}) : [];
  const doneCount = selDocs.filter(([, d]) => d).length;
  const totalDocs = selDocs.length || 6;
  const pct = totalDocs > 0 ? Math.round((doneCount / totalDocs) * 100) : 0;
  const ss = (status) => STATUS_MAP[status] || STATUS_MAP.pending;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg text-white font-semibold z-50 shadow-lg ${
          toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'
        }`}>{toast.msg}</div>
      )}

      <PageHeader title="Pre-Enrollment" subtitle="Manage student pre-enrollment submissions and document requirements" />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[ 
          { label: 'Total Applicants', value: enrollments.length, sub: 'this semester', topColor: 'var(--reg-navy)', valColor: 'var(--reg-text)' },
          { label: 'Pending Review', value: enrollments.filter(e => e.status === 'pending').length, sub: 'needs action', topColor: 'var(--reg-red)', valColor: 'var(--reg-red)' },
          { label: 'Approved', value: enrollments.filter(e => e.status === 'approved').length, sub: 'ready to enroll', topColor: 'var(--reg-green)', valColor: 'var(--reg-green)' },
          { label: 'Incomplete', value: enrollments.filter(e => e.status === 'incomplete').length, sub: 'awaiting docs', topColor: 'var(--reg-amber)', valColor: 'var(--reg-amber)' },
        ].map(c => (
          <Card key={c.label} className="p-4" style={{ borderTop: `3px solid ${c.topColor}` }}>
            <p className="text-xs mb-1" style={{ color: 'var(--reg-muted)' }}>{c.label}</p>
            <p className="text-2xl font-bold mb-1" style={{ color: c.valColor, fontFamily: 'Georgia,serif' }}>{c.value}</p>
            <p className="text-xs font-semibold" style={{ color: c.valColor }}>{c.sub}</p>
          </Card>
        ))}
      </div>

      {/* Split: Queue | Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT: Application Queue */}
        <Card className="overflow-hidden lg:col-span-1">
          <div className="p-4">
            <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--reg-text)' }}>Application Queue</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              {[
                { val: 'all', label: `All (${enrollments.length})` },
                { val: 'pending', label: `Pending (${enrollments.filter(e => e.status === 'pending').length})` },
                { val: 'approved', label: `Approved (${enrollments.filter(e => e.status === 'approved').length})` },
                { val: 'incomplete', label: `Incomplete (${enrollments.filter(e => e.status === 'incomplete').length})` },
              ].map(f => {
                const active = filterStatus === f.val;
                return (
                  <button key={f.val} onClick={() => setFilterStatus(f.val)}
                    className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: active ? 'var(--reg-navy)' : 'var(--reg-surface-hover)',
                      color: active ? '#fff' : 'var(--reg-muted)',
                    }}>{f.label}</button>
                );
              })}
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--reg-muted)' }} />
              <input type="text" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500"
                style={{ backgroundColor: 'var(--reg-input-bg)', border: '1px solid var(--reg-border)', color: 'var(--reg-text)' }} />
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="animate-spin" style={{ color: 'var(--reg-muted)' }} /></div>
            ) : filtered.map(e => {
              const isActive = selected?.id === e.id;
              const s = ss(e.status);
              return (
                <div key={e.id} onClick={() => setSelected(e)}
                  className="px-4 py-3 cursor-pointer transition-colors border-t"
                  style={{
                    backgroundColor: isActive ? 'var(--reg-sidebar-active-bg)' : 'transparent',
                    borderColor: 'var(--reg-border)',
                  }}>
                  <div className="flex gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" 
                      style={{ backgroundColor: e.avatar_bg || '#1B2A4A' }}>{e.initials || 'ST'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--reg-text)' }}>{e.student_name}</p>
                        <span className="text-xs font-bold flex-shrink-0" style={{ color: s.color }}>{s.label}</span>
                      </div>
                      <p className="text-xs" style={{ color: 'var(--reg-muted)' }}>{e.student_no} · {e.course} {e.year} yr</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* RIGHT: Detail Panel */}
        {selected ? (
          <Card className="lg:col-span-2 overflow-hidden">
            <div className="p-5 flex items-center justify-between" style={{ backgroundColor: 'var(--reg-navy)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white border-2" 
                  style={{ backgroundColor: selected.avatar_bg || '#1B2A4A', borderColor: 'var(--reg-gold)' }}>{selected.initials || 'ST'}</div>
                <div>
                  <p className="text-white font-bold text-sm">{selected.student_name}</p>
                  <p className="text-xs" style={{ color: '#8FA8C8' }}>{selected.student_no} · {selected.course} – {selected.year} Year</p>
                </div>
              </div>
              <Badge color="#fff" bg={selected.status === 'pending' ? '#E8811A' : selected.status === 'approved' ? 'var(--reg-green)' : 'var(--reg-amber)'}
                style={{ color: '#fff' }}>
                {selected.status?.toUpperCase()}
              </Badge>
            </div>

            <div className="p-5">
              <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--reg-muted)' }}>Personal Information</p>
              <div className="grid grid-cols-[80px_1fr] gap-y-2 mb-5">
                {[['Email', selected.email], ['Contact', selected.contact], ['Address', selected.address]].map(([k, v]) => (
                  <React.Fragment key={k}>
                    <span className="text-xs" style={{ color: 'var(--reg-muted)' }}>{k}</span>
                    <span className="text-sm font-medium" style={{ color: 'var(--reg-text)' }}>{v || '—'}</span>
                  </React.Fragment>
                ))}
              </div>

              <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--reg-muted)' }}>Document Checklist</p>
              <div className="space-y-2 mb-4">
                {DOCUMENT_TYPES.map(({ key, label, required }) => (
                  <div key={key} onClick={() => !saving && toggleDoc(key)}
                    className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors"
                    style={{
                      backgroundColor: selected.documents?.[key] ? 'rgba(22,163,74,0.08)' : 'var(--reg-surface-hover)',
                      border: `1px solid ${selected.documents?.[key] ? 'rgba(22,163,74,0.3)' : 'var(--reg-border)'}`,
                    }}>
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors"
                        style={{ backgroundColor: selected.documents?.[key] ? 'var(--reg-green)' : 'var(--reg-border)' }}>
                        {selected.documents?.[key] && <Check size={12} color="#fff" strokeWidth={3} />}
                      </div>
                      <div>
                        <span className="text-sm font-medium" style={{ color: selected.documents?.[key] ? 'var(--reg-green)' : 'var(--reg-muted)' }}>{label}</span>
                        {required && <span className="text-[10px] ml-2 px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--reg-red)', color: '#fff' }}>Required</span>}
                      </div>
                    </div>
                    <Badge color={selected.documents?.[key] ? 'var(--reg-green)' : 'var(--reg-amber)'} 
                      bg={selected.documents?.[key] ? 'rgba(22,163,74,0.12)' : 'rgba(217,119,6,0.12)'}>
                      {selected.documents?.[key] ? 'Submitted' : 'Missing'}
                    </Badge>
                  </div>
                ))}
              </div>

              <div className="mb-4">
                <div className="flex justify-between mb-1">
                  <span className="text-xs" style={{ color: 'var(--reg-muted)' }}>Completion: {doneCount} of {totalDocs} documents</span>
                  <span className="text-xs font-bold" style={{ color: pct === 100 ? 'var(--reg-green)' : 'var(--reg-amber)' }}>{pct}%</span>
                </div>
                <div className="h-2 rounded-full" style={{ backgroundColor: 'var(--reg-border)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? 'var(--reg-green)' : 'var(--reg-gold)' }} />
                </div>
              </div>

              <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note for the student..." rows={2}
                className="w-full rounded-lg p-3 text-sm resize-none outline-none mb-4"
                style={{ backgroundColor: 'var(--reg-surface-hover)', border: '1px solid var(--reg-border)', color: 'var(--reg-text)' }} />

              <div className="flex gap-3">
                <Btn onClick={handleApprove} className="flex-1 justify-center" disabled={saving}>
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={3} />} Approve
                </Btn>
                <Btn variant="outline" className="flex-1 justify-center" onClick={handleReturn} disabled={saving}>
                  <RotateCcw size={15} /> Return
                </Btn>
                <Btn variant="outline" className="flex-1 justify-center" onClick={handleReject} disabled={saving}>
                  <X size={15} /> Reject
                </Btn>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="lg:col-span-2 flex items-center justify-center min-h-[400px]">
            <p style={{ color: 'var(--reg-muted)' }}>Select an application to review</p>
          </Card>
        )}
      </div>
    </div>
  );
};

export default PreEnrollmentTab;
