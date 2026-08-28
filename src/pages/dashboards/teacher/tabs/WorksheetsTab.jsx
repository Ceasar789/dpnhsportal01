// ============================================
// FILE: src/pages/dashboards/teacher/tabs/WorksheetsTab.jsx
// WORKSHEETS TAB — Full Supabase CRUD + File Upload
// Split from the original monolithic TeacherDashboard.jsx (2,918 lines)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import {
  FileText, Plus, Search, Trash2, Edit, X, Check, Upload, Download,
  Loader2, Eye, FileUp
} from 'lucide-react';
import { useTheme, useToast } from '../hooks';
import { Card, Input, Table, TR, TD, Modal, Badge, Btn } from '../shared/ui';

const WorksheetsTab = () => {
  const { dark } = useTheme();
  const { userData } = useAuth();
  const { toast, showToast } = useToast();
  const [activeFilter, setActiveFilter] = useState('All');
  const [worksheets, setWorksheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewingWorksheet, setPreviewingWorksheet] = useState(null);
  const [formData, setFormData] = useState({ title: '', subject: '', pages: '', items: '', status: 'Draft' });
  const [saving, setSaving] = useState(false);

  const filters = ['All', 'English', 'Math', 'Science', 'Filipino', 'Araling Panlipunan'];

  const fetchWorksheets = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('worksheets')
      .select('*')
      .eq('teacher_id', userData?.uid)
      .order('created_at', { ascending: false });
    
    if (error) showToast('Error: ' + error.message, 'error');
    else setWorksheets(data || []);
    setLoading(false);
  }, [userData, showToast]);

  useEffect(() => {
    fetchWorksheets();
    const channel = supabase
      .channel('teacher-worksheets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'worksheets' }, fetchWorksheets)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchWorksheets]);

  const handleAddWorksheet = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('worksheets').insert([{
      ...formData,
      teacher_id: userData?.uid,
      created_at: new Date().toISOString()
    }]);
    
    if (error) showToast('Error: ' + error.message, 'error');
    else {
      showToast('Worksheet created');
      setFormData({ title: '', subject: '', pages: '', items: '', status: 'Draft' });
      setShowAddModal(false);
      fetchWorksheets();
    }
    setSaving(false);
  };

  const handleDistribute = async (id) => {
    const { error } = await supabase.from('worksheets').update({ status: 'Distributed', updated_at: new Date().toISOString() }).eq('id', id);
    if (error) showToast('Error: ' + error.message, 'error');
    else {
      showToast('Worksheet distributed to students');
      fetchWorksheets();
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this worksheet?')) return;
    const { error } = await supabase.from('worksheets').delete().eq('id', id);
    if (error) showToast('Error: ' + error.message, 'error');
    else {
      showToast('Worksheet deleted');
      fetchWorksheets();
    }
  };

  const handlePreview = (worksheet) => {
    setPreviewingWorksheet(worksheet);
    setShowPreviewModal(true);
  };

  const downloadWorksheet = (worksheet) => {
    if (worksheet.file_url) {
      window.open(worksheet.file_url, '_blank');
      showToast(`Downloaded: ${worksheet.file_name || worksheet.title}`);
    } else {
      showToast('No file available for download', 'error');
    }
  };

  const handleUploadWorksheet = async (e) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    setSaving(true);
    
    try {
      // Validate file type
      const validTypes = ['.pdf', '.docx', '.doc', '.xlsx'];
      const fileExt = '.' + file.name.split('.').pop().toLowerCase();
      
      if (!validTypes.includes(fileExt)) {
        throw new Error(`Invalid file type. Supported: PDF, DOCX, DOC, XLSX`);
      }
      
      if (file.size > 50 * 1024 * 1024) {
        throw new Error('File size exceeds 50MB limit');
      }

      const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}${fileExt}`;
      const filePath = `${userData?.uid}/${fileName}`;
      
      // Upload file to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('worksheets')
        .upload(filePath, file, { 
          cacheControl: '3600', 
          upsert: false 
        });
      
      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      if (!uploadData?.path) {
        throw new Error('File upload did not return a valid path');
      }
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('worksheets')
        .getPublicUrl(filePath);
      
      const publicUrl = urlData?.publicUrl;
      if (!publicUrl) {
        throw new Error('Could not generate public URL for uploaded file');
      }
      
      // Extract title from filename
      const titleFromFile = file.name.replace(/\.[^/.]+$/, '');
      
      // Insert into database
      const { data: insertData, error: dbError } = await supabase.from('worksheets').insert([{
        title: titleFromFile || 'Worksheet',
        subject: 'Uploaded Document',
        file_url: publicUrl,
        file_name: file.name,
        file_path: filePath,
        pages: 'N/A',
        items: 0,
        teacher_id: userData?.uid,
        status: 'Draft',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }]).select();
      
      if (dbError) {
        console.error('Database error:', dbError);
        throw new Error(`Database error: ${dbError.message}`);
      }

      if (!insertData || insertData.length === 0) {
        throw new Error('Failed to save worksheet to database');
      }
      
      showToast(`Worksheet "${file.name}" uploaded successfully!`, 'success');
      fetchWorksheets();
      e.target.value = '';
    } catch (error) {
      console.error('Worksheet Upload Error:', error);
      showToast(`Error uploading worksheet: ${error.message}`, 'error');
    }
    setSaving(false);
  };

  const filtered = activeFilter === 'All' ? worksheets : worksheets.filter(w => w.subject === activeFilter);
  const stats = {
    total: worksheets.length,
    distributed: worksheets.filter(w => w.status === 'Distributed').length,
    drafts: worksheets.filter(w => w.status === 'Draft').length
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg text-white font-semibold z-50 ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
          {toast.msg}
        </div>
      )}
      
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <h1 className="text-xl font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Worksheets</h1>
        <div className="flex gap-3">
          <Btn onClick={() => setShowAddModal(true)}><Plus size={16} /> Create</Btn>
          <input type="file" accept=".pdf,.docx,.doc,.xlsx" id="worksheetUpload" className="hidden" onChange={handleUploadWorksheet} />
          <Btn variant="primary" onClick={() => document.getElementById('worksheetUpload')?.click()}><Upload size={16} /> Upload</Btn>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Worksheets', value: stats.total },
          { label: 'Distributed', value: stats.distributed, color: '#16a34a' },
          { label: 'Drafts', value: stats.drafts, color: '#d97706' },
        ].map((stat, idx) => (
          <Card key={idx} className="p-4">
            <p className="text-xs mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>{stat.label}</p>
            <p className="text-2xl font-bold" style={{ color: stat.color || (dark ? '#f1f5f9' : '#1a2b4a') }}>{stat.value}</p>
          </Card>
        ))}
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {loading ? (
          <div className="col-span-3 flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" /></div>
        ) : filtered.map((ws, idx) => (
          <Card key={ws.id} className="p-4">
            <div className="flex justify-between items-start mb-3">
              <div className="w-10 h-14 rounded flex items-center justify-center"
                style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc' }}>
                <FileText size={20} style={{ color: '#3b82f6' }} />
              </div>
              <Badge color={ws.status === 'Distributed' ? '#16a34a' : '#d97706'} 
                bg={ws.status === 'Distributed' ? 'rgba(22,163,74,0.12)' : 'rgba(217,119,6,0.12)'}>
                {ws.status}
              </Badge>
            </div>
            <h3 className="text-sm font-semibold mb-1" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{ws.title}</h3>
            <p className="text-xs mb-3" style={{ color: dark ? '#64748b' : '#94a3b8' }}>{ws.subject} · {ws.pages || '—'} pages · {ws.items || '—'} items</p>
            <div className="flex gap-2">
              {ws.status === 'Draft' && (
                <button onClick={() => handleDistribute(ws.id)} className="flex-1 h-8 rounded-lg text-xs font-semibold transition-colors"
                  style={{ backgroundColor: '#1e3a5f', color: '#ffffff' }}>Distribute</button>
              )}
              <button onClick={() => handlePreview(ws)} className="flex-1 h-8 rounded-lg text-xs font-semibold transition-colors"
                style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', color: dark ? '#cbd5e1' : '#374151', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
                {ws.file_url ? 'View' : 'Preview'}
              </button>
              {ws.file_url && (
                <button onClick={() => downloadWorksheet(ws)} className="h-8 px-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                  style={{ backgroundColor: '#3b82f6', color: '#ffffff' }}>
                  <Download size={12} /> Download
                </button>
              )}
              <button onClick={() => handleDelete(ws.id)} className="h-8 w-8 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50"
                style={{ border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
                <Trash2 size={14} />
              </button>
            </div>
          </Card>
        ))}
        {!loading && filtered.length === 0 && (
          <div className="col-span-3 text-center py-10" style={{ color: dark ? '#64748b' : '#94a3b8' }}>No worksheets found</div>
        )}
      </div>

      {showAddModal && (
        <Modal title="Create Worksheet" onClose={() => setShowAddModal(false)}>
          <form onSubmit={handleAddWorksheet} className="flex flex-col gap-4">
            <Input placeholder="Title" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
            <select value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})}
              className="w-full h-10 px-3 rounded-lg text-sm outline-none"
              style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`, color: dark ? '#f1f5f9' : '#1a2b4a' }}>
              <option value="">Select Subject</option>
              {filters.slice(1).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <Input placeholder="Pages" value={formData.pages} onChange={e => setFormData({...formData, pages: e.target.value})} />
            <Input placeholder="Items" value={formData.items} onChange={e => setFormData({...formData, items: e.target.value})} />
            <button type="submit" disabled={saving} className="w-full h-10 rounded-lg text-white text-sm font-semibold flex items-center justify-center gap-2"
              style={{ backgroundColor: '#1e3a5f' }}>
              {saving && <Loader2 size={16} className="animate-spin" />} Create Worksheet
            </button>
          </form>
        </Modal>
      )}

      {showPreviewModal && previewingWorksheet && (
        <Modal title={`Preview: ${previewingWorksheet.title}`} onClose={() => setShowPreviewModal(false)}>
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs uppercase mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>File Information</p>
              <div className="grid grid-cols-2 gap-3" style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>File Name</p>
                  <p className="text-sm font-medium" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{previewingWorksheet.file_name || previewingWorksheet.title}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Subject</p>
                  <p className="text-sm" style={{ color: dark ? '#cbd5e1' : '#475569' }}>{previewingWorksheet.subject}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Status</p>
                  <Badge color={previewingWorksheet.status === 'Distributed' ? '#16a34a' : '#d97706'} 
                    bg={previewingWorksheet.status === 'Distributed' ? 'rgba(22,163,74,0.12)' : 'rgba(217,119,6,0.12)'}>
                    {previewingWorksheet.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Created</p>
                  <p className="text-sm" style={{ color: dark ? '#cbd5e1' : '#475569' }}>{new Date(previewingWorksheet.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
            {previewingWorksheet.file_url ? (
              <div className="h-48 rounded-lg flex items-center justify-center" style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', border: `2px solid ${dark ? '#334155' : '#cbd5e1'}` }}>
                <div className="text-center">
                  <FileText size={48} style={{ color: '#3b82f6' }} className="mx-auto mb-2" />
                  <p style={{ color: dark ? '#cbd5e1' : '#475569' }}>Document loaded and ready</p>
                  <p className="text-xs mt-2" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Click Download to open file</p>
                </div>
              </div>
            ) : (
              <div className="h-48 rounded-lg flex items-center justify-center" style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', border: `2px dashed ${dark ? '#334155' : '#cbd5e1'}` }}>
                <div className="text-center">
                  <FileText size={48} style={{ color: '#64748b' }} className="mx-auto mb-2" />
                  <p style={{ color: dark ? '#64748b' : '#94a3b8' }}>No file attached</p>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              {previewingWorksheet.file_url && (
                <button onClick={() => downloadWorksheet(previewingWorksheet)} className="flex-1 h-10 rounded-lg text-white text-sm font-semibold flex items-center justify-center gap-2"
                  style={{ backgroundColor: '#3b82f6' }}>
                  <Download size={16} /> Download File
                </button>
              )}
              <button onClick={() => setShowPreviewModal(false)} className="flex-1 h-10 rounded-lg text-white text-sm font-semibold"
                style={{ backgroundColor: '#1e3a5f' }}>Close</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default WorksheetsTab;
