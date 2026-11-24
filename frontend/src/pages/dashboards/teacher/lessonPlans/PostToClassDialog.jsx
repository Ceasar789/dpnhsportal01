// R19 / R20 / R23 (4d, design p14): "Post to class" / "Reuse and repost" for a
// saved lesson plan. Rendered only when VITE_LESSON_PLAN_POSTING_ENABLED=1.
import { useEffect, useState } from 'react';
import { Modal, Btn } from '../shared/ui';
import { supabase } from '../../../../config/supabase';
import { AUDIENCE_LABELS, AUDIENCES, loadClassList, loadTeacherSections, postRow, savePost } from './postToClass';

export default function PostToClassDialog({ plan, teacherId, onClose, onPosted }) {
  const [sections, setSections] = useState(undefined); // undefined loading, null failed
  const [sectionId, setSectionId] = useState('');
  const [roster, setRoster] = useState(undefined);
  const [audience, setAudience] = useState('all');
  const [ticked, setTicked] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    loadTeacherSections(supabase, teacherId).then(list => { if (active) setSections(list); });
    return () => { active = false; };
  }, [teacherId]);

  useEffect(() => {
    if (!sectionId) return undefined;
    let active = true;
    loadClassList(supabase, sectionId).then(list => { if (active) setRoster(list); });
    return () => { active = false; };
  }, [sectionId]);

  const submit = async () => {
    const built = postRow({ planId: plan.id, teacherId, sectionId, audience, ticked, roster });
    if (built.error) { setError(built.error); return; }
    setBusy(true);
    const result = await savePost(supabase, built.row);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    onPosted?.(built.row);
  };

  const muted = { color: 'var(--text-muted)' };
  return (
    <Modal title={`Post "${plan.title || 'lesson plan'}" to a class`} onClose={onClose} closeDisabled={busy} size="max-w-lg">
      <div className="grid gap-4 text-sm" style={{ color: 'var(--text)' }}>
        <p style={muted}>Posting tells EduScribe which class this plan is for. Students do not see lesson plans; your admin can.</p>
        <label className="grid gap-1">
          <span className="font-semibold">Class</span>
          {sections === undefined ? <span role="status" style={muted}>Loading your classes…</span>
            : sections === null ? <span role="alert">Your classes could not be loaded. Close and try again.</span>
              : sections.length === 0 ? <span style={muted}>You have no classes assigned yet.</span>
                : <select value={sectionId} onChange={e => { setSectionId(e.target.value); setRoster(undefined); setTicked([]); setError(''); }}
                  className="min-h-11 rounded-lg px-3 text-base" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--card-bg)', color: 'var(--text)' }}>
                  <option value="">Choose a class</option>
                  {sections.map(s => <option key={s.id} value={s.id}>{[s.grade_level, s.name].filter(Boolean).join(' · ')}</option>)}
                </select>}
        </label>
        <fieldset className="grid gap-1">
          <legend className="font-semibold">Who it is for</legend>
          {AUDIENCES.map(value => (
            <label key={value} className="flex items-center gap-2 min-h-11">
              <input type="radio" name="lesson-plan-audience" value={value} checked={audience === value}
                onChange={() => { setAudience(value); setError(''); }} />
              {AUDIENCE_LABELS[value]}
            </label>
          ))}
        </fieldset>
        {audience !== 'all' && sectionId && (
          <fieldset className="grid gap-1 max-h-60 overflow-y-auto">
            <legend className="font-semibold">{audience === 'only' ? 'Tick the students' : 'Tick the students to leave out'}</legend>
            {roster === undefined ? <span role="status" style={muted}>Loading the class list…</span>
              : roster === null ? <span role="alert">The class list could not be loaded.</span>
                : roster.length === 0 ? <span style={muted}>This class has no active students.</span>
                  : roster.map(s => (
                    <label key={s.id} className="flex items-center gap-2 min-h-11">
                      <input type="checkbox" checked={ticked.includes(s.id)}
                        onChange={e => setTicked(list => (e.target.checked ? [...list, s.id] : list.filter(id => id !== s.id)))} />
                      {s.name}
                    </label>
                  ))}
          </fieldset>
        )}
        {error && <p role="alert" style={{ color: 'var(--badge-red-fg)' }}>{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Btn variant="outline" className="min-h-[44px]" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn variant="primary" className="min-h-[44px]" onClick={submit} busy={busy} disabled={busy}>Post</Btn>
        </div>
      </div>
    </Modal>
  );
}
