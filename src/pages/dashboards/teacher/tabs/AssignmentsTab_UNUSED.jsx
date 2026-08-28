// ============================================
// FILE: src/pages/dashboards/teacher/tabs/AssignmentsTab_UNUSED.jsx
// DEAD CODE IN THE ORIGINAL — this component was defined in the old
// monolithic TeacherDashboard.jsx but was NEVER routed to (the actual
// "/assignments" route uses the separate AssessmentsTab.jsx instead).
// Preserved here, unused, exactly as it was in the original file.
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { FileText, Plus, Search, Trash2, Edit, X, Check, Upload, Download, Loader2, Eye } from 'lucide-react';
import { useTheme, useToast } from '../hooks';
import { Card, Input, Table, TR, TD, Modal, Badge, Btn } from '../shared/ui';

const AssignmentsTab_UNUSED = () => {
  const { dark } = useTheme();
  const { userData } = useAuth();
  const { toast, showToast } = useToast();
  const [activeFilter, setActiveFilter] = useState('All');
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewingAssignment, setReviewingAssignment] = useState(null);
  const [formData, setFormData] = useState({ title: '', subject: '', due_date: '', description: '' });
  const [saving, setSaving] = useState(false);

  const filters = ['All', 'Open', 'Due today', 'Graded', 'Draft'];

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      // Get sections where this teacher teaches
      const { data: sectionsData, error: sectionsError } = await supabase
        .from('sections')
        .select('id')
        .eq('adviser_id', userData?.uid);
      
      if (sectionsError) throw sectionsError;
      
      const sectionIds = sectionsData?.map(s => s.id) || [];
      
      // Get assignments for these sections
      let assignmentsQuery = supabase
        .from('assignments')
        .select('*, assignment_submissions(id)')
        .eq('teacher_id', userData?.uid)
        .order('due_date', { ascending: true });
      
      if (sectionIds.length > 0) {
        assignmentsQuery = assignmentsQuery.in('section_id', sectionIds);
      }
      
      const { data: assignmentsData, error: assignmentsError } = await assignmentsQuery;
      
      if (assignmentsError) throw assignmentsError;
      
      // Calculate submission counts
      const enrichedAssignments = (assignmentsData || []).map(a => ({
        ...a,
        submitted_count: a.assignment_submissions?.length || 0,
        status: a.status === 'active' ? 'Open' : a.status === 'closed' ? 'Closed' : 'Archived'
      }));
      
      setAssignments(enrichedAssignments);
      
      // Get recent submissions
      const { data: submissionsData, error: submissionsError } = await supabase
        .from('assignment_submissions')
        .select('id, assignment_id, student_id, profiles(name), file_name, created_at')
        .order('created_at', { ascending: false })
        .limit(4);
      
      if (submissionsError) throw submissionsError;
      
      const mappedSubmissions = (submissionsData || []).map(s => ({
        ...s,
        student_name: s.profiles?.name || 'Unknown'
      }));
      
      setSubmissions(mappedSubmissions);
    } catch (error) {
      showToast('Error loading assignments: ' + error.message, 'error');
    }
    setLoading(false);
  }, [userData, showToast]);

  useEffect(() => {
    fetchAssignments();
    const channels = [
      supabase.channel('teacher-assignments').on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, fetchAssignments).subscribe(),
      supabase.channel('teacher-submissions').on('postgres_changes', { event: '*', schema: 'public', table: 'assignment_submissions' }, fetchAssignments).subscribe()
    ];
    return () => channels.forEach(ch => supabase.removeChannel(ch));
  }, [fetchAssignments]);

  const handleAddAssignment = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('assignments').insert([{
      ...formData,
      teacher_id: userData?.uid,
      status: 'Open',
      created_at: new Date().toISOString()
    }]);
    
    if (error) showToast('Error: ' + error.message, 'error');
    else {
      showToast('Assignment created');
      setFormData({ title: '', subject: '', due_date: '', description: '' });
      setShowAddModal(false);
      fetchAssignments();
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this assignment?')) return;
    const { error } = await supabase.from('assignments').delete().eq('id', id);
    if (error) showToast('Error: ' + error.message, 'error');
    else {
      showToast('Assignment deleted');
      fetchAssignments();
    }
  };

  const handleReview = (assignment) => {
    setReviewingAssignment(assignment);
    setShowReviewModal(true);
  };

  const handleGradeSubmission = async (submissionId, grade) => {
    if (!grade) {
      showToast('Please select a grade', 'error');
      return;
    }
    
    try {
      const gradeValue = grade === 'A' ? 95 : grade === 'B' ? 85 : grade === 'C' ? 75 : grade === 'D' ? 65 : 50;
      const { error } = await supabase.from('assignment_submissions').update({ 
        grade,
        grade_value: gradeValue,
        points_earned: gradeValue,
        feedback: `Graded as ${grade} by teacher on ${new Date().toLocaleDateString()}`,
        graded_at: new Date().toISOString(),
        graded_by: userData?.uid,
        updated_at: new Date().toISOString() 
      }).eq('id', submissionId);

      if (error) throw error;
      showToast(`Submission graded as ${grade} and saved!`);
      fetchAssignments();
    } catch (error) {
      showToast('Error: ' + error.message, 'error');
    }
  };

  const filtered = activeFilter === 'All' ? assignments : assignments.filter(a => {
    if (activeFilter === 'Due today') return a.status === 'Due Today';
    return a.status === activeFilter;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg text-white font-semibold z-50 ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
          {toast.msg}
        </div>
      )}
      
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <h1 className="text-xl font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Assignments</h1>
        <Btn onClick={() => setShowAddModal(true)}><Plus size={16} /> New assignment</Btn>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {filters.map(f => (
          <button key={f} onClick={() => setActiveFilter(f)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium"
            style={{
              backgroundColor: activeFilter === f ? '#1e3a5f' : (dark ? '#1e293b' : '#ffffff'),
              border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
              color: activeFilter === f ? '#ffffff' : (dark ? '#94a3b8' : '#64748b')
            }}>
            {f}
          </button>
        ))}
      </div>

      <Card className="mb-6">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" /></div>
        ) : (
          <Table headers={['Title', 'Subject', 'Due Date', 'Submitted', 'Status', 'Actions']}>
            {filtered.map((a, i) => (
              <TR key={a.id}>
                <TD><span className="font-medium" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{a.title}</span></TD>
                <TD>{a.subject}</TD>
                <TD style={{ color: a.status === 'Due Today' ? '#ef4444' : undefined }}>
                  {new Date(a.due_date).toLocaleDateString()}
                </TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full" style={{ backgroundColor: dark ? '#334155' : '#e2e8f0' }}>
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${(a.submitted_count || 0) / 38 * 100}%` }} />
                    </div>
                    <span className="text-xs">{a.submitted_count || 0}/38</span>
                  </div>
                </TD>
                <TD><Badge color={a.status === 'Due Today' ? '#ef4444' : a.status === 'Graded' ? '#16a34a' : '#d97706'} 
                  bg={a.status === 'Due Today' ? 'rgba(239,68,68,0.12)' : a.status === 'Graded' ? 'rgba(22,163,74,0.12)' : 'rgba(217,119,6,0.12)'}>
                  {a.status}
                </Badge></TD>
                <TD>
                  <div className="flex gap-2">
                    <button onClick={() => handleReview(a)} className="text-xs text-blue-500 hover:text-blue-700 font-medium">Review</button>
                    <button onClick={() => handleDelete(a.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                  </div>
                </TD>
              </TR>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8">
                  <p className="text-base font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>No assignments yet</p>
                  <p className="text-sm" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Create the first assignment to share academic tasks with your students.</p>
                </td>
              </tr>
            )}
          </Table>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-4"
          style={{ color: dark ? '#64748b' : '#94a3b8' }}>Recent Submissions</h2>
        {submissions.length === 0 ? (
          <p className="text-sm" style={{ color: dark ? '#64748b' : '#94a3b8' }}>No submissions yet</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {submissions.map((sub, idx) => (
              <div key={idx} className="rounded-lg p-3"
                style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
                <p className="text-sm font-medium mb-0.5" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{sub.student_name}</p>
                <p className="text-xs text-blue-500 mb-1">{sub.file_name}</p>
                <p className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>{new Date(sub.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {showAddModal && (
        <Modal title="New Assignment" onClose={() => setShowAddModal(false)}>
          <form onSubmit={handleAddAssignment} className="flex flex-col gap-4">
            <Input placeholder="Title" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
            <Input placeholder="Subject" required value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})} />
            <Input type="date" required value={formData.due_date} onChange={e => setFormData({...formData, due_date: e.target.value})} />
            <textarea placeholder="Description" rows={3} value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`, color: dark ? '#f1f5f9' : '#1a2b4a' }} />
            <button type="submit" disabled={saving} className="w-full h-10 rounded-lg text-white text-sm font-semibold flex items-center justify-center gap-2"
              style={{ backgroundColor: '#1e3a5f' }}>
              {saving && <Loader2 size={16} className="animate-spin" />} Create Assignment
            </button>
          </form>
        </Modal>
      )}

      {showReviewModal && reviewingAssignment && (
        <Modal title={`Review: ${reviewingAssignment.title}`} onClose={() => setShowReviewModal(false)}>
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs uppercase mb-2" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Assignment Details</p>
              <div className="space-y-2 mb-4" style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                <div><strong style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Due Date:</strong> <span style={{ color: dark ? '#cbd5e1' : '#475569' }}>{new Date(reviewingAssignment.due_date).toLocaleDateString()}</span></div>
                <div><strong style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Status:</strong> <Badge color={reviewingAssignment.status === 'Graded' ? '#16a34a' : '#d97706'} bg={reviewingAssignment.status === 'Graded' ? 'rgba(22,163,74,0.12)' : 'rgba(217,119,6,0.12)'}>{reviewingAssignment.status}</Badge></div>
                <div><strong style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Submitted:</strong> <span style={{ color: dark ? '#cbd5e1' : '#475569' }}>{reviewingAssignment.submitted_count || 0}/38 students</span></div>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase mb-2" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Recent Submissions</p>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {submissions.filter(s => s.assignment_id === reviewingAssignment.id).slice(0, 8).map((sub, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded border" 
                    style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', borderColor: dark ? '#334155' : '#e2e8f0' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{sub.student_name}</p>
                      <div className="flex gap-2 text-xs mt-0.5">
                        <span style={{ color: dark ? '#64748b' : '#94a3b8' }}>📤 {new Date(sub.created_at).toLocaleDateString()}</span>
                        {sub.grade && <Badge color="#16a34a" bg="rgba(22,163,74,0.12)">{sub.grade}</Badge>}
                      </div>
                    </div>
                    <select defaultValue={sub.grade || ''} onChange={(e) => handleGradeSubmission(sub.id, e.target.value)}
                      className="h-8 px-2 rounded text-xs outline-none font-semibold"
                      style={{ backgroundColor: dark ? '#1e293b' : '#ffffff', border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`, color: dark ? '#f1f5f9' : '#1a2b4a' }}>
                      <option value="">Grade</option>
                      <option value="A">A (95-100)</option>
                      <option value="B">B (85-94)</option>
                      <option value="C">C (75-84)</option>
                      <option value="D">D (65-74)</option>
                      <option value="F">F (Below 65)</option>
                    </select>
                  </div>
                ))}
                {submissions.length === 0 && (
                  <p className="text-sm text-center py-4" style={{ color: dark ? '#64748b' : '#94a3b8' }}>No submissions yet</p>
                )}
              </div>
            </div>
            <button onClick={() => setShowReviewModal(false)} className="w-full h-10 rounded-lg text-white text-sm font-semibold"
              style={{ backgroundColor: '#1e3a5f' }}>Close & Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AssignmentsTab_UNUSED;
