// ============================================
// FILE: src/pages/dashboards/teacher/worksheets/PostToSectionModal.jsx
// Posts one worksheet to one section with a due date.
// ============================================

import React, { useState } from 'react';
import { Modal, Btn } from '../shared/ui';
import { useTheme } from '../hooks';

const PostToSectionModal = ({ worksheet, sections, sectionsError, onPost, onClose }) => {
  const { dark } = useTheme();
  const [sectionId, setSectionId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [saving, setSaving] = useState(false);

  const fieldStyle = {
    backgroundColor: dark ? '#0f172a' : '#f8fafc',
    border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
    color: dark ? '#f1f5f9' : '#1a2b4a',
  };

  const submit = async () => {
    setSaving(true);
    const ok = await onPost(worksheet.id, sectionId, dueAt);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal title={`Post "${worksheet.title}"`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {sectionsError ? (
          <p className="text-sm" style={{ color: '#dc2626' }}>
            Could not load your sections. Check your connection and reopen this window.
          </p>
        ) : sections.length === 0 ? (
          <p className="text-sm" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
            You have no sections yet. An administrator assigns these in Schedules.
          </p>
        ) : (
          <>
            <div>
              <label className="text-xs font-semibold" style={{ color: dark ? '#94a3b8' : '#64748b' }}>Section</label>
              <select value={sectionId} onChange={e => setSectionId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg text-sm outline-none mt-1" style={fieldStyle}>
                <option value="">Select section…</option>
                {sections.map(s => <option key={s.id} value={s.id}>{s.name} ({s.grade_level})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: dark ? '#94a3b8' : '#64748b' }}>Due date</label>
              <input type="date" value={dueAt} onChange={e => setDueAt(e.target.value)}
                className="w-full h-10 px-3 rounded-lg text-sm outline-none mt-1" style={fieldStyle} />
            </div>
          </>
        )}

        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={submit}
            disabled={saving || sectionsError || sections.length === 0}>
            {saving ? 'Posting…' : 'Post'}
          </Btn>
        </div>
      </div>
    </Modal>
  );
};

export default PostToSectionModal;
