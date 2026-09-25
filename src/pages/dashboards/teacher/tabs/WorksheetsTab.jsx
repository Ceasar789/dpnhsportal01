// ============================================
// FILE: src/pages/dashboards/teacher/tabs/WorksheetsTab.jsx
// WORKSHEETS TAB — Full Supabase CRUD + File Upload
// Split from the original monolithic TeacherDashboard.jsx (2,918 lines)
// ============================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { withRetry } from '../../../../lib/supabaseRetry';
import {
  FileText, Plus, Search, Trash2, Edit, X, Check, Upload, Download,
  Loader2, Eye, FileUp
} from 'lucide-react';
import { useTheme, useToast } from '../hooks';
import { Card, Input, Table, TR, TD, Modal, Badge, Btn } from '../shared/ui';
import { TASK_TYPES, TASK_TYPE_LABELS } from '../../../../lib/taskFormatting';
import { useWorksheetAssessment } from '../worksheets/useWorksheetAssessment';
import DistributeModal from '../worksheets/DistributeModal';
import QuestionBuilderModal from '../worksheets/QuestionBuilderModal';
import CheckSubmissionsModal from '../worksheets/CheckSubmissionsModal';
import EncodeScoresModal from '../worksheets/EncodeScoresModal';

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
  const [formData, setFormData] = useState({ title: '', subject: '', pages: '', items: '', task_type: 'worksheet' });
  const [saving, setSaving] = useState(false);
  const assessment = useWorksheetAssessment(showToast);
  const [distributingTask, setDistributingTask] = useState(null);
  const [buildingWorksheet, setBuildingWorksheet] = useState(null);
  const [checkingWorksheet, setCheckingWorksheet] = useState(null);
  const [encodingWorksheet, setEncodingWorksheet] = useState(null);

  const fetchWorksheets = useCallback(async () => {
    setLoading(true);
    const { data, error } = await withRetry(
      () => supabase
        .from('worksheets')
        .select('*')
        .eq('teacher_id', userData?.uid)
        .order('created_at', { ascending: false }),
      { label: 'Worksheets fetch' }
    );

    if (error) showToast('Error: ' + error.message, 'error');
    else setWorksheets(data || []);
    setLoading(false);
  }, [userData, showToast]);

  useEffect(() => {
    fetchWorksheets();
  }, [fetchWorksheets]);

  const handleAddWorksheet = async (e) => {
    e.preventDefault();
    if (assessment.subjectError) {
      showToast('Could not load your teaching load. Check your connection and try again.', 'error');
      return;
    }
    if (assessment.subjectConflict) {
      showToast('You are assigned more than one subject. Ask your admin to correct your teaching load — a task has to belong to exactly one subject.', 'error');
      return;
    }
    if (assessment.subjectLoading) {
      showToast('Still loading your teaching load — try again in a moment.', 'error');
      return;
    }
    if (!assessment.mySubject) {
      showToast('No subject is assigned to you yet. Ask your admin to set your teaching load before creating tasks.', 'error');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('worksheets').insert([{
      ...formData,
      subject: assessment.mySubject.name,
      subject_id: assessment.mySubject.id,
      task_type: formData.task_type,
      teacher_id: userData?.uid,
      created_at: new Date().toISOString()
    }]);

    if (error) showToast('Error: ' + error.message, 'error');
    else {
      showToast('Worksheet created');
      setFormData({ title: '', subject: '', pages: '', items: '', task_type: 'worksheet' });
      setShowAddModal(false);
      fetchWorksheets();
    }
    setSaving(false);
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
    if (assessment.subjectError) {
      showToast('Could not load your teaching load. Check your connection and try again.', 'error');
      return;
    }
    if (assessment.subjectConflict) {
      showToast('You are assigned more than one subject. Ask your admin to correct your teaching load — a task has to belong to exactly one subject.', 'error');
      return;
    }
    if (assessment.subjectLoading) {
      showToast('Still loading your teaching load — try again in a moment.', 'error');
      return;
    }
    if (!assessment.mySubject) {
      showToast('No subject is assigned to you yet. Ask your admin to set your teaching load before creating tasks.', 'error');
      return;
    }
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
        subject: assessment.mySubject.name,
        subject_id: assessment.mySubject.id,
        task_type: 'worksheet',
        file_url: publicUrl,
        file_name: file.name,
        file_path: filePath,
        pages: 'N/A',
        items: 0,
        teacher_id: userData?.uid,
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

  // Derived from the worksheets actually on this teacher's list, not a
  // hardcoded registry — a literal list drifts from the canonical subject
  // names (e.g. 'Math' vs the registered 'Mathematics') and leaves newer
  // subjects unreachable. A teacher with one subject just sees two chips.
  const filters = useMemo(() => {
    const subjects = [...new Set(worksheets.map(w => w.subject).filter(Boolean))].sort();
    return ['All', ...subjects];
  }, [worksheets]);

  const filtered = activeFilter === 'All' ? worksheets : worksheets.filter(w => w.subject === activeFilter);
  // `worksheets.status` is a dead column — distribution lives in
  // task_assignees now, via assessment.assigneeCounts. A worksheet counts as
  // distributed here only when it genuinely has at least one assignee. A
  // failed count read must not read as "0 distributed" (that is the same
  // lie in a new place), so both tiles fall back to an explicit unknown
  // state rather than a number when assessment.assigneeCountsError is set.
  const stats = {
    total: worksheets.length,
    distributed: worksheets.filter(w => (assessment.assigneeCounts[w.id] || 0) > 0).length,
  };

  return (
    <div className="p-6">
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
          {
            label: 'Distributed',
            // Loading and error are both "not a real number yet" states —
            // neither may render as 0 or as the eventual value, or the tile
            // makes the exact same false claim finding 4 existed to remove,
            // just from a different window (first paint, or a slow retry).
            value: assessment.assigneeCountsLoading ? '…' : assessment.assigneeCountsError ? '—' : stats.distributed,
            color: assessment.assigneeCountsLoading ? (dark ? '#64748b' : '#94a3b8')
              : assessment.assigneeCountsError ? '#dc2626' : '#16a34a',
          },
          {
            label: 'Not distributed',
            value: assessment.assigneeCountsLoading ? '…' : assessment.assigneeCountsError ? '—' : (stats.total - stats.distributed),
            color: assessment.assigneeCountsLoading ? (dark ? '#64748b' : '#94a3b8')
              : assessment.assigneeCountsError ? '#dc2626' : '#d97706',
          },
        ].map((stat, idx) => (
          <Card key={idx} className="p-4">
            <p className="text-xs mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>{stat.label}</p>
            <p className="text-2xl font-bold" style={{ color: stat.color || (dark ? '#f1f5f9' : '#1a2b4a') }}>{stat.value}</p>
            {assessment.assigneeCountsError && !assessment.assigneeCountsLoading && idx > 0 && (
              <button onClick={() => assessment.fetchAssigneeCounts()}
                className="text-[11px] underline font-semibold mt-1" style={{ color: '#dc2626' }}>
                Retry
              </button>
            )}
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
        ) : filtered.map((ws, idx) => {
          const distributedCount = assessment.assigneeCounts[ws.id] || 0;
          return (
          <Card key={ws.id} className="p-4">
            <div className="flex justify-between items-start mb-3">
              <div className="w-10 h-14 rounded flex items-center justify-center"
                style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc' }}>
                <FileText size={20} style={{ color: '#3b82f6' }} />
              </div>
              {/* `ws.status` is a dead column — nothing writes it anymore.
                  The badge is derived from real assignee rows instead. Both
                  a failed read AND the window before the first read settles
                  must render as their own neutral state — neither may fall
                  through to "Not distributed", which is a positive claim of
                  0 that is not yet (or no longer) known to be true. */}
              {assessment.assigneeCountsLoading ? (
                <Badge color={dark ? '#94a3b8' : '#64748b'} bg={dark ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.12)'}>
                  Checking…
                </Badge>
              ) : assessment.assigneeCountsError ? (
                <span className="flex items-center gap-2">
                  <Badge color="#dc2626" bg="rgba(220,38,38,0.12)">Status unknown</Badge>
                  <button onClick={() => assessment.fetchAssigneeCounts()}
                    className="text-[11px] underline font-semibold" style={{ color: '#dc2626' }}>
                    Retry
                  </button>
                </span>
              ) : (
                <Badge color={distributedCount > 0 ? '#16a34a' : '#d97706'}
                  bg={distributedCount > 0 ? 'rgba(22,163,74,0.12)' : 'rgba(217,119,6,0.12)'}>
                  {distributedCount > 0 ? `Distributed · ${distributedCount}` : 'Not distributed'}
                </Badge>
              )}
            </div>
            <h3 className="text-sm font-semibold mb-1" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{ws.title}</h3>
            <p className="text-xs mb-3" style={{ color: dark ? '#64748b' : '#94a3b8' }}>{ws.subject} · {ws.pages || '—'} pages · {ws.items || '—'} items</p>
            <div className="flex gap-2">
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
              <button onClick={() => setDistributingTask(ws)} className="flex-1 h-8 rounded-lg text-xs font-semibold transition-colors"
                style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', color: dark ? '#cbd5e1' : '#374151', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
                Distribute
              </button>
              <button onClick={() => setBuildingWorksheet(ws)} className="flex-1 h-8 rounded-lg text-xs font-semibold transition-colors"
                style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', color: dark ? '#cbd5e1' : '#374151', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
                Questions
              </button>
              <button onClick={() => setCheckingWorksheet(ws)} className="h-8 px-2.5 rounded-lg text-xs font-semibold"
                style={{ border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, color: dark ? '#94a3b8' : '#64748b' }}>
                Check
              </button>
              <button onClick={() => setEncodingWorksheet(ws)} className="h-8 px-2.5 rounded-lg text-xs font-semibold"
                title="For a class that answered on paper — type each student's total"
                style={{ border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, color: dark ? '#94a3b8' : '#64748b' }}>
                Encode scores
              </button>
              <button onClick={() => handleDelete(ws.id)} className="h-8 w-8 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50"
                style={{ border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
                <Trash2 size={14} />
              </button>
            </div>
            {assessment.postingsError ? (
              <p className="text-[11px] mt-2 flex items-center gap-2" style={{ color: '#dc2626' }}>
                Posting status could not be loaded.
                <button onClick={() => assessment.fetchPostings()} className="underline font-semibold" style={{ color: '#dc2626' }}>
                  Retry
                </button>
              </p>
            ) : assessment.postings.filter(p => p.worksheet_id === ws.id).length > 0 && (
              <p className="text-[11px] mt-2" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                Posted to {assessment.postings.filter(p => p.worksheet_id === ws.id).length} section(s)
              </p>
            )}
          </Card>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div className="col-span-3 text-center py-10" style={{ color: dark ? '#64748b' : '#94a3b8' }}>No worksheets found</div>
        )}
      </div>

      {showAddModal && (
        <Modal title="Create Worksheet" onClose={() => setShowAddModal(false)}>
          <form onSubmit={handleAddWorksheet} className="flex flex-col gap-4">
            <Input placeholder="Title" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
            <div>
              <label className="text-xs font-semibold" style={{ color: dark ? '#94a3b8' : '#64748b' }}>Type</label>
              <select value={formData.task_type}
                onChange={e => setFormData({ ...formData, task_type: e.target.value })}
                className="w-full h-10 px-3 rounded-lg text-sm outline-none mt-1"
                style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc',
                         border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
                         color: dark ? '#f1f5f9' : '#1a2b4a' }}>
                {TASK_TYPES.map(t => <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <p className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
              {assessment.subjectLoading ? (
                <>Loading your teaching load…</>
              ) : (
                <>
                  Subject: <strong style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
                    {assessment.mySubject?.name || '—'}
                  </strong> (from your teaching load)
                </>
              )}
            </p>
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
                  {assessment.assigneeCountsLoading ? (
                    <Badge color={dark ? '#94a3b8' : '#64748b'} bg={dark ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.12)'}>
                      Checking…
                    </Badge>
                  ) : assessment.assigneeCountsError ? (
                    <Badge color="#dc2626" bg="rgba(220,38,38,0.12)">Status unknown</Badge>
                  ) : (() => {
                    const count = assessment.assigneeCounts[previewingWorksheet.id] || 0;
                    return (
                      <Badge color={count > 0 ? '#16a34a' : '#d97706'}
                        bg={count > 0 ? 'rgba(22,163,74,0.12)' : 'rgba(217,119,6,0.12)'}>
                        {count > 0 ? `Distributed · ${count}` : 'Not distributed'}
                      </Badge>
                    );
                  })()}
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

      {distributingTask && (
        <DistributeModal
          task={distributingTask}
          sections={assessment.mySections}
          sectionsError={assessment.sectionsError}
          onRetrySections={assessment.fetchMySections}
          loadClassList={assessment.loadClassList}
          loadAssignees={assessment.loadAssignees}
          loadSubmissions={assessment.loadSubmissions}
          distributeTask={assessment.distributeTask}
          onClose={() => setDistributingTask(null)}
          showToast={showToast}
        />
      )}

      {buildingWorksheet && (
        <QuestionBuilderModal
          worksheet={buildingWorksheet}
          loadItems={assessment.loadItems}
          saveItems={assessment.saveItems}
          setCheckingMode={assessment.setCheckingMode}
          onClose={() => { setBuildingWorksheet(null); fetchWorksheets(); }}
        />
      )}

      {checkingWorksheet && (
        <CheckSubmissionsModal
          worksheet={checkingWorksheet}
          loadItems={assessment.loadItems}
          loadSubmissions={assessment.loadSubmissions}
          loadAnswers={assessment.loadAnswers}
          releaseScore={assessment.releaseScore}
          onClose={() => setCheckingWorksheet(null)}
        />
      )}

      {encodingWorksheet && (
        <EncodeScoresModal
          worksheet={encodingWorksheet}
          postings={assessment.postings}
          sections={assessment.mySections}
          loadClassList={assessment.loadClassList}
          loadSubmissions={assessment.loadSubmissions}
          encodeManualScore={assessment.encodeManualScore}
          onClose={() => setEncodingWorksheet(null)}
        />
      )}
    </div>
  );
};

export default WorksheetsTab;
