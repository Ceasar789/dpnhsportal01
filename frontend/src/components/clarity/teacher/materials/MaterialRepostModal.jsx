// ============================================
// FILE: src/components/clarity/teacher/materials/MaterialRepostModal.jsx
// U-PDF-T-FIX-B: "Reuse and repost" a material to another of the teacher's
// classes. One class select (classes of the material's grade; every class for
// a material with no grade), classes that already have it marked "Already
// posted"; then the class's active students in one column, all ticked, with a
// Select all box ("N of M will see it"). Saving calls the share function with
// NULL (everyone) or the ticked ids; its codes become sentences in materialsApi.
// ============================================

import { useEffect, useId, useRef, useState } from 'react';
import ClarityModal from '../../ui/ClarityModal';
import useDialogSafety from '../../../../pages/dashboards/teacher/worksheets/useDialogSafety';
import { classCell, classLabel, classesByGrade } from './materialRules';
import { loadClassList, shareMaterialToClass } from './materialsApi';
import { supabase } from '../../../../config/supabase';

const initial = name => (String(name || '').trim()[0] || '?').toUpperCase();

const MaterialRepostModal = ({ row, classes = [], posted = [], client = supabase, onPosted, onClose }) => {
  const [sectionId, setSectionId] = useState('');
  const [roster, setRoster] = useState({ status: 'idle', students: [] });
  const [ticked, setTicked] = useState(() => new Set());
  const [rosterKey, setRosterKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const allRef = useRef(null);
  const ids = { section: useId(), who: useId(), count: useId(), error: useId() };
  const { requestClose, routeBlocker } = useDialogSafety({ dirty: false, pending: busy, onClose });

  const postedIds = new Set(posted.map(s => s.id));
  // A material with a grade goes only to classes of that grade.
  const offered = classes.filter(s => !row.grade_level || s.grade_level === row.grade_level);
  const groups = classesByGrade(offered);
  const chosen = offered.find(s => s.id === sectionId && !postedIds.has(s.id)) || null;
  const total = roster.students.length;
  const count = roster.students.filter(s => ticked.has(s.id)).length;
  const all = total > 0 && count === total;
  const chosenId = chosen ? chosen.id : '';

  useEffect(() => {
    if (!chosenId) return undefined;
    let active = true;
    Promise.resolve().then(async () => {
      if (!active) return;
      setRoster({ status: 'loading', students: [] });
      const students = await loadClassList(client, chosenId);
      if (!active) return;
      if (students === null) { setRoster({ status: 'error', students: [] }); return; }
      setRoster({ status: 'ready', students });
      setTicked(new Set(students.map(s => s.id)));
    });
    return () => { active = false; };
  }, [chosenId, client, rosterKey]);

  useEffect(() => { if (allRef.current) allRef.current.indeterminate = count > 0 && count < total; }, [count, total]);

  const toggle = (id) => setTicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const submit = async () => {
    if (busyRef.current || !chosen || count === 0) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    const studentIds = all ? null : roster.students.filter(s => ticked.has(s.id)).map(s => s.id);
    const result = await shareMaterialToClass({ materialId: row.id, sectionId: chosen.id, studentIds, client });
    busyRef.current = false;
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    onPosted(chosen);
  };

  const subtitle = `${row.title} · ${posted.length ? `posted to ${classCell(posted)}` : 'Private'}`;
  const ready = Boolean(chosen) && roster.status === 'ready' && count > 0 && !busy;

  return (
    <ClarityModal
      title="Reuse and repost"
      description={subtitle}
      onClose={() => requestClose()}
      closeDisabled={busy}
      footer={(
        <div className="x-tlm-mf">
          <button type="button" className="x-btn" disabled={busy} onClick={() => requestClose()}>Cancel</button>
          <button type="button" className="x-btn pri" disabled={!ready} aria-busy={busy ? 'true' : undefined} onClick={submit}>
            {busy ? 'Posting…' : chosen ? `Repost to ${classLabel(chosen)}` : 'Repost'}
          </button>
        </div>
      )}
    >
      {error && <p id={ids.error} role="alert" className="x-tlm-err">{error}</p>}
      <div className="x-field">
        <label className="x-label" htmlFor={ids.section}>Post to which class?</label>
        <select id={ids.section} className="x-select x-tlm-wide" value={chosen ? chosen.id : ''} disabled={busy}
          onChange={e => { setSectionId(e.target.value); setError(''); }}>
          <option value="">{offered.length ? 'Choose a class' : 'No classes to post to'}</option>
          {groups.map(([grade, sections]) => (
            <optgroup key={grade} label={grade}>
              {sections.map(section => (
                <option key={section.id} value={section.id} disabled={postedIds.has(section.id)}>
                  {classLabel(section)}{postedIds.has(section.id) ? ' (Already posted)' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {!offered.length && <p className="x-hint">You have no classes{row.grade_level ? ` in ${row.grade_level}` : ''} to post this material to.</p>}
      </div>

      {chosen && (
        <fieldset className="x-field x-tlm-who" aria-describedby={ids.count}>
          <legend className="x-label" id={ids.who}>Who can see it?</legend>
          {roster.status === 'loading' && <p role="status" className="x-hint">Loading the class list…</p>}
          {roster.status === 'error' && (
            <p className="x-hint" role="alert">The class list could not be loaded.{' '}
              <button type="button" className="x-btn gh x-tlm-retry" onClick={() => setRosterKey(k => k + 1)}>Retry</button></p>
          )}
          {roster.status === 'ready' && total === 0 && <p className="x-hint">This class has no active students yet.</p>}
          {roster.status === 'ready' && total > 0 && (
            <>
              <label className="x-tlm-all">
                <input ref={allRef} type="checkbox" checked={all} disabled={busy} aria-describedby={ids.count}
                  onChange={() => setTicked(all ? new Set() : new Set(roster.students.map(s => s.id)))} />
                <span>Select all</span>
                <span className="x-tlm-count" id={ids.count}>{count} of {total} will see it</span>
              </label>
              <ul className="x-tlm-roster" aria-labelledby={ids.who}>
                {roster.students.map(student => (
                  <li key={student.id}>
                    <label className="x-tlm-student">
                      <input type="checkbox" checked={ticked.has(student.id)} disabled={busy} onChange={() => toggle(student.id)} />
                      <span className="x-tlm-avatar" aria-hidden="true">{initial(student.name)}</span>
                      <span className="x-tlm-sname">{student.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </fieldset>
      )}
      {routeBlocker}
    </ClarityModal>
  );
};

export default MaterialRepostModal;
