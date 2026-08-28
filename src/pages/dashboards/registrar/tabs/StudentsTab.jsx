// ============================================
// FILE: src/pages/dashboards/registrar/tabs/StudentsTab.jsx
// Split from the original monolithic RegistrarDashboard.jsx (2,158 lines)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { Search, Plus, Eye, Loader2, Trash2, Edit3, Save } from 'lucide-react';
import { Card, Badge, Btn, SectionTitle, PageHeader } from '../shared/ui';
import { STATUS_MAP, DOCUMENT_TYPES } from '../shared/constants';

const StudentsTab = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCourse, setFilterCourse] = useState('All');
  const [filterYear, setFilterYear] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [newStudent, setNewStudent] = useState({
    name: '', email: '', course: '', year: '', student_no: '', status: 'Active'
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'student')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching students:', error);
      showToast('Error fetching students', 'error');
    } else {
      setStudents(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStudents();
    const channel = supabase
      .channel('registrar-students')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchStudents)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const handleAddStudent = async () => {
    if (!newStudent.name || !newStudent.email) {
      showToast('Name and email are required', 'error');
      return;
    }
    setSaving(true);

    const { error } = await supabase.from('profiles').insert([{
      ...newStudent,
      role: 'student',
      created_at: new Date().toISOString()
    }]);

    if (error) {
      showToast('Error: ' + error.message, 'error');
    } else {
      showToast('Student added successfully');
      setShowAddModal(false);
      setNewStudent({ name: '', email: '', course: '', year: '', student_no: '', status: 'Active' });
      fetchStudents();
    }
    setSaving(false);
  };

  const handleUpdateStudent = async () => {
    if (!selectedStudent?.id) return;
    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        ...selectedStudent,
        updated_at: new Date().toISOString()
      })
      .eq('id', selectedStudent.id);

    if (error) {
      showToast('Error: ' + error.message, 'error');
    } else {
      showToast('Student updated successfully');
      setShowEditModal(false);
      fetchStudents();
    }
    setSaving(false);
  };

  const handleDeleteStudent = async (id) => {
    if (!window.confirm('Are you sure you want to delete this student?')) return;

    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) {
      showToast('Error deleting student', 'error');
    } else {
      showToast('Student deleted successfully');
      fetchStudents();
    }
  };

  const courses = ['All', ...new Set(students.map(s => s.course).filter(Boolean))];
  const years = ['All', ...new Set(students.map(s => s.year).filter(Boolean))];
  const statuses = ['All', 'Active', 'Inactive', 'Dropped', 'Graduated', 'Suspended'];

  const filtered = students.filter(s =>
    (filterCourse === 'All' || s.course === filterCourse) &&
    (filterYear === 'All' || s.year === filterYear) &&
    (filterStatus === 'All' || s.status === filterStatus) &&
    (s.name?.toLowerCase().includes(searchQuery.toLowerCase()) || s.student_no?.includes(searchQuery))
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg text-white font-semibold z-50 shadow-lg ${
          toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'
        }`}>{toast.msg}</div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <PageHeader title="Student Records" subtitle="Manage and view all student academic records" />
        <Btn onClick={() => setShowAddModal(true)}><Plus size={16} /> Add Student</Btn>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--reg-muted)' }} />
          <input type="text" placeholder="Search students..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-3 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
            style={{ backgroundColor: 'var(--reg-input-bg)', border: '1px solid var(--reg-border)', color: 'var(--reg-text)' }} />
        </div>
        <select value={filterCourse} onChange={e => setFilterCourse(e.target.value)}
          className="h-10 px-3 rounded-lg text-sm outline-none"
          style={{ backgroundColor: 'var(--reg-input-bg)', border: '1px solid var(--reg-border)', color: 'var(--reg-text)' }}>
          {courses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
          className="h-10 px-3 rounded-lg text-sm outline-none"
          style={{ backgroundColor: 'var(--reg-input-bg)', border: '1px solid var(--reg-border)', color: 'var(--reg-text)' }}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="h-10 px-3 rounded-lg text-sm outline-none"
          style={{ backgroundColor: 'var(--reg-input-bg)', border: '1px solid var(--reg-border)', color: 'var(--reg-text)' }}>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <p className="text-xs mb-3" style={{ color: 'var(--reg-muted)' }}>
        Showing {filtered.length} of {students.length} students
      </p>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: 'var(--reg-surface-hover)' }}>
                {['Student No.', 'Name', 'Course', 'Year', 'Status', 'Date Added', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--reg-muted-light)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-10"><Loader2 className="animate-spin mx-auto" style={{ color: 'var(--reg-muted)' }} /></td></tr>
              ) : filtered.map(s => {
                const statusConfig = STATUS_MAP[s.status?.toLowerCase()] || STATUS_MAP.active;
                return (
                  <tr key={s.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/30" style={{ borderTop: '1px solid var(--reg-border)' }}>
                    <td className="px-5 py-3.5 text-sm font-mono" style={{ color: 'var(--reg-muted)' }}>{s.student_no || '—'}</td>
                    <td className="px-5 py-3.5 text-sm font-medium" style={{ color: 'var(--reg-text)' }}>{s.name}</td>
                    <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--reg-muted)' }}>{s.course || '—'}</td>
                    <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--reg-muted)' }}>{s.year || '—'}</td>
                    <td className="px-5 py-3.5">
                      <Badge color={statusConfig.color} bg={statusConfig.bg}>{statusConfig.label}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--reg-muted)' }}>
                      {new Date(s.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex gap-1">
                        <button onClick={() => { setSelectedStudent(s); setShowViewModal(true); }}
                          className="p-1.5 rounded-md transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/20" style={{ color: 'var(--reg-blue)' }} title="View">
                          <Eye size={16} />
                        </button>
                        <button onClick={() => { setSelectedStudent(s); setShowEditModal(true); }}
                          className="p-1.5 rounded-md transition-colors hover:bg-amber-50 dark:hover:bg-amber-900/20" style={{ color: 'var(--reg-amber)' }} title="Edit">
                          <Edit3 size={16} />
                        </button>
                        <button onClick={() => handleDeleteStudent(s.id)}
                          className="p-1.5 rounded-md transition-colors hover:bg-red-50 dark:hover:bg-red-900/20" style={{ color: 'var(--reg-red)' }} title="Delete">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: 'var(--reg-muted)' }}>No students found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Student Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="rounded-lg p-6 w-full max-w-md" style={{ backgroundColor: 'var(--reg-surface)', border: '1px solid var(--reg-border)' }}>
            <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--reg-text)' }}>Add New Student</h3>
            <div className="space-y-3">
              <input placeholder="Full Name *" value={newStudent.name} onChange={e => setNewStudent({...newStudent, name: e.target.value})}
                className="w-full p-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: 'var(--reg-border)', background: 'var(--reg-input-bg)', color: 'var(--reg-text)' }} />
              <input placeholder="Email *" type="email" value={newStudent.email} onChange={e => setNewStudent({...newStudent, email: e.target.value})}
                className="w-full p-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: 'var(--reg-border)', background: 'var(--reg-input-bg)', color: 'var(--reg-text)' }} />
              <input placeholder="Student No." value={newStudent.student_no} onChange={e => setNewStudent({...newStudent, student_no: e.target.value})}
                className="w-full p-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: 'var(--reg-border)', background: 'var(--reg-input-bg)', color: 'var(--reg-text)' }} />
              <input placeholder="Course" value={newStudent.course} onChange={e => setNewStudent({...newStudent, course: e.target.value})}
                className="w-full p-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: 'var(--reg-border)', background: 'var(--reg-input-bg)', color: 'var(--reg-text)' }} />
              <input placeholder="Year Level" value={newStudent.year} onChange={e => setNewStudent({...newStudent, year: e.target.value})}
                className="w-full p-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: 'var(--reg-border)', background: 'var(--reg-input-bg)', color: 'var(--reg-text)' }} />
              <select value={newStudent.status} onChange={e => setNewStudent({...newStudent, status: e.target.value})}
                className="w-full p-2.5 rounded-lg border text-sm outline-none"
                style={{ borderColor: 'var(--reg-border)', background: 'var(--reg-input-bg)', color: 'var(--reg-text)' }}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Dropped">Dropped</option>
                <option value="Graduated">Graduated</option>
                <option value="Suspended">Suspended</option>
              </select>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddModal(false)} className="flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors hover:bg-gray-50"
                style={{ borderColor: 'var(--reg-border)', color: 'var(--reg-muted)' }}>Cancel</button>
              <button onClick={handleAddStudent} disabled={saving} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: 'var(--reg-navy)' }}>
                {saving ? <Loader2 className="animate-spin mx-auto" size={16} /> : 'Add Student'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Student Modal */}
      {showEditModal && selectedStudent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="rounded-lg p-6 w-full max-w-md" style={{ backgroundColor: 'var(--reg-surface)', border: '1px solid var(--reg-border)' }}>
            <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--reg-text)' }}>Edit Student</h3>
            <div className="space-y-3">
              <input placeholder="Full Name" value={selectedStudent.name || ''} onChange={e => setSelectedStudent({...selectedStudent, name: e.target.value})}
                className="w-full p-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: 'var(--reg-border)', background: 'var(--reg-input-bg)', color: 'var(--reg-text)' }} />
              <input placeholder="Email" type="email" value={selectedStudent.email || ''} onChange={e => setSelectedStudent({...selectedStudent, email: e.target.value})}
                className="w-full p-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: 'var(--reg-border)', background: 'var(--reg-input-bg)', color: 'var(--reg-text)' }} />
              <input placeholder="Student No." value={selectedStudent.student_no || ''} onChange={e => setSelectedStudent({...selectedStudent, student_no: e.target.value})}
                className="w-full p-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: 'var(--reg-border)', background: 'var(--reg-input-bg)', color: 'var(--reg-text)' }} />
              <input placeholder="Course" value={selectedStudent.course || ''} onChange={e => setSelectedStudent({...selectedStudent, course: e.target.value})}
                className="w-full p-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: 'var(--reg-border)', background: 'var(--reg-input-bg)', color: 'var(--reg-text)' }} />
              <input placeholder="Year Level" value={selectedStudent.year || ''} onChange={e => setSelectedStudent({...selectedStudent, year: e.target.value})}
                className="w-full p-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: 'var(--reg-border)', background: 'var(--reg-input-bg)', color: 'var(--reg-text)' }} />
              <select value={selectedStudent.status || 'Active'} onChange={e => setSelectedStudent({...selectedStudent, status: e.target.value})}
                className="w-full p-2.5 rounded-lg border text-sm outline-none"
                style={{ borderColor: 'var(--reg-border)', background: 'var(--reg-input-bg)', color: 'var(--reg-text)' }}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Dropped">Dropped</option>
                <option value="Graduated">Graduated</option>
                <option value="Suspended">Suspended</option>
              </select>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowEditModal(false)} className="flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors hover:bg-gray-50"
                style={{ borderColor: 'var(--reg-border)', color: 'var(--reg-muted)' }}>Cancel</button>
              <button onClick={handleUpdateStudent} disabled={saving} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: 'var(--reg-navy)' }}>
                {saving ? <Loader2 className="animate-spin mx-auto" size={16} /> : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Student Modal */}
      {showViewModal && selectedStudent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="rounded-lg p-6 w-full max-w-lg" style={{ backgroundColor: 'var(--reg-surface)', border: '1px solid var(--reg-border)' }}>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white"
                style={{ backgroundColor: selectedStudent.avatar_bg || '#1B2A4A' }}>
                {selectedStudent.initials || selectedStudent.name?.[0]?.toUpperCase() || 'S'}
              </div>
              <div>
                <h3 className="text-lg font-bold" style={{ color: 'var(--reg-text)' }}>{selectedStudent.name}</h3>
                <p className="text-sm" style={{ color: 'var(--reg-muted)' }}>{selectedStudent.student_no || 'No Student ID'}</p>
              </div>
              <Badge color={STATUS_MAP[selectedStudent.status?.toLowerCase()]?.color || '#16a34a'}
                bg={STATUS_MAP[selectedStudent.status?.toLowerCase()]?.bg || 'rgba(22,163,74,0.12)'}>
                {selectedStudent.status || 'Active'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--reg-surface-hover)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--reg-muted)' }}>Email</p>
                <p className="text-sm font-medium" style={{ color: 'var(--reg-text)' }}>{selectedStudent.email || '—'}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--reg-surface-hover)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--reg-muted)' }}>Course</p>
                <p className="text-sm font-medium" style={{ color: 'var(--reg-text)' }}>{selectedStudent.course || '—'}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--reg-surface-hover)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--reg-muted)' }}>Year Level</p>
                <p className="text-sm font-medium" style={{ color: 'var(--reg-text)' }}>{selectedStudent.year || '—'}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--reg-surface-hover)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--reg-muted)' }}>Date Added</p>
                <p className="text-sm font-medium" style={{ color: 'var(--reg-text)' }}>{new Date(selectedStudent.created_at).toLocaleDateString()}</p>
              </div>
            </div>

            <button onClick={() => setShowViewModal(false)}
              className="w-full py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{ backgroundColor: 'var(--reg-surface-hover)', color: 'var(--reg-text)', border: '1px solid var(--reg-border)' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentsTab;
