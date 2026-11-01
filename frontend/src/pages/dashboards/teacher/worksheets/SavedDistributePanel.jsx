import { useEffect, useId, useRef, useState } from 'react';
import { Btn, ConfirmDialog, Input, Modal } from '../shared/ui';
import { distributeAiWeeklyCollection } from '../persistence/aiWeeklyWorksheetDistributeClient';

const TOO_LARGE = 'This section has more than 200 students. Distributing to groups this large is not supported yet.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const minuteInManila = (date = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};
const nextMinuteInManila = () => minuteInManila(new Date(Math.floor(Date.now() / 60000) * 60000 + 60000));
const validManilaDateTime = value => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}:00+08:00`))
  && minuteInManila(new Date(`${value}:00+08:00`)) === value;
const initials = name => name.trim().split(/\s+/).slice(0, 2).map(part => part[0].toUpperCase()).join('');

export default function SavedDistributePanel({ collectionId, revision, dayNumber, dayName, worksheetTitle,
  checkingMode, modeEditable,
  client, teacherId, apiBase,
  onCollectionChanged, onDistributed, onReload, onClose }) {
  const sectionInputId = useId();
  const dueInputId = useId();
  const [sections, setSections] = useState([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [sectionsError, setSectionsError] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [students, setStudents] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterReady, setRosterReady] = useState(false);
  const [rosterError, setRosterError] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [dueTime, setDueTime] = useState('');
  const [currentManilaMinute, setCurrentManilaMinute] = useState(minuteInManila);
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [detail, setDetail] = useState('');
  const [reloadOffered, setReloadOffered] = useState(false);
  const [unknownLock, setUnknownLock] = useState(false);
  const busyRef = useRef(false);
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentManilaMinute(minuteInManila()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadSections = async () => {
      try {
        if (!client || !teacherId) throw new Error('missing client');
        const { data: sched, error: schedError } = await client.from('schedules')
          .select('section_id').eq('teacher_id', teacherId);
        if (schedError || !Array.isArray(sched)) throw new Error('schedules unavailable');
        const { data: advised, error: advisedError } = await client.from('sections')
          .select('id, name, grade_level').eq('adviser_id', teacherId);
        if (advisedError || !Array.isArray(advised)) throw new Error('sections unavailable');
        const ids = [...new Set(sched.map(row => row.section_id))];
        let scheduled = [];
        if (ids.length) {
          const { data, error } = await client.from('sections')
            .select('id, name, grade_level').in('id', ids);
          if (error || !Array.isArray(data)) throw new Error('sections unavailable');
          scheduled = data;
        }
        const merged = [...advised.map(row => ({ ...row, isAdviser: true })),
          ...scheduled.map(row => ({ ...row, isAdviser: false }))]
          .filter((row, index, all) => all.findIndex(item => item.id === row.id) === index)
          .sort((a, b) => (b.isAdviser - a.isAdviser)
            || (a.name || '').localeCompare(b.name || ''));
        if (merged.some(row => !row.id || typeof row.name !== 'string' || !row.name.trim())) {
          throw new Error('section name unavailable');
        }
        if (!cancelled) setSections(merged);
      } catch {
        if (!cancelled) setSectionsError('Could not load your assigned sections. Close and reopen this dialog.');
      } finally {
        if (!cancelled) setSectionsLoading(false);
      }
    };
    void loadSections();
    return () => { cancelled = true; };
  }, [client, teacherId]);

  useEffect(() => {
    let cancelled = false;
    setStudents([]);
    setSelectedIds([]);
    setRosterReady(false);
    setRosterError('');
    if (!sectionId) { setRosterLoading(false); return () => { cancelled = true; }; }
    setRosterLoading(true);
    const loadRoster = async () => {
      try {
        const { data: rows, error } = await client.from('section_students')
          .select('student_id').eq('section_id', sectionId).eq('status', 'active').limit(201);
        if (error || !Array.isArray(rows)) throw new Error('roster unavailable');
        if (rows.length >= 201) {
          if (!cancelled) setRosterError(TOO_LARGE);
          return;
        }
        const ids = [...new Set(rows.map(row => row.student_id))];
        let names = [];
        if (ids.length) {
          const result = await client.from('profiles').select('id, name').in('id', ids);
          if (result.error || !Array.isArray(result.data)) throw new Error('names unavailable');
          names = result.data;
        }
        const roster = ids.map(id => {
          const name = names.find(row => row.id === id)?.name;
          if (typeof name !== 'string' || !name.trim() || UUID.test(name.trim())) {
            throw new Error('name unavailable');
          }
          return { id, name: name.trim() };
        }).sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) { setStudents(roster); setRosterReady(true); }
      } catch {
        if (!cancelled) setRosterError('Could not read every student name. Distribution is unavailable.');
      } finally {
        if (!cancelled) setRosterLoading(false);
      }
    };
    void loadRoster();
    return () => { cancelled = true; };
  }, [client, sectionId]);

  const dueValid = !dueTime || (validManilaDateTime(dueTime) && dueTime > currentManilaMinute);
  const ready = Boolean(sectionId && rosterReady && !sectionsLoading && !sectionsError
    && !rosterLoading && !rosterError && selectedIds.length && Number.isInteger(dayNumber)
    && dayNumber >= 1 && dayNumber <= 5 && dueValid
    && !busy && !unknownLock);
  const reviewSelection = () => {
    if (!ready) return;
    const now = minuteInManila();
    if (dueTime && (!validManilaDateTime(dueTime) || dueTime <= now)) {
      setCurrentManilaMinute(now);
      return;
    }
    const sectionName = sections.find(section => section.id === sectionId)?.name;
    if (!sectionName) return;
    setReview({ sectionId, sectionName, dayNumber, dayName,
      studentIds: [...selectedIds], dueTime, dueAt: dueTime ? `${dueTime}:00+08:00` : null,
      dueLabel: dueTime ? `${dueTime.replace('T', ' ')} Manila time` : 'No deadline' });
  };
  const distribute = async () => {
    if (busyRef.current || !review || unknownLock) return;
    if (review.dueTime && review.dueTime <= minuteInManila()) {
      setCurrentManilaMinute(minuteInManila());
      setReview(null);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setReview(null);
    setMessage('');
    setDetail('');
    setReloadOffered(false);
    try {
      const result = await distributeAiWeeklyCollection(apiBase, {
        collectionId, expectedRevision: revision, sectionId: review.sectionId,
        days: [review.dayNumber], studentIds: review.studentIds, dueAt: review.dueAt,
      });
      if (result.status === 'saved') {
        const { inserted, alreadyAssigned, assignedElsewhere } = result.receipt;
        const summary = `Distributed: ${inserted} new, ${alreadyAssigned} already assigned`
          + (assignedElsewhere > 0 ? `. ${assignedElsewhere} were already assigned under another section` : '');
        setMessage(summary);
        try {
          await onCollectionChanged?.();
          onDistributed?.(summary);
          onClose?.();
        } catch {
          setMessage('Distributed, but the list could not refresh. Reload the collection.');
          setUnknownLock(true);
        }
      } else if (result.status === 'failed') {
        setMessage(result.message);
        setReloadOffered(['revision_conflict', 'collection_archived'].includes(result.code));
      } else {
        setMessage(result.message);
        setDetail(result.detail || 'unknown_result');
        setUnknownLock(true);
      }
    } catch {
      setMessage('Could not confirm the change. Reload the collection before trying again.');
      setDetail('unexpected_error');
      setUnknownLock(true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const modeLabel = checkingMode === 'auto' ? 'Auto-check'
    : checkingMode === 'manual' ? 'Manual check' : null;
  const modeNotice = modeLabel
    ? `Checking: ${modeLabel}.${modeEditable ? ' Change this in Edit/Preview before distributing.' : ''} ` : '';

  return <>
    <Modal title={`Distribute ${dayName} worksheet`} size="max-w-2xl"
      description={`Distribute ${worksheetTitle} to selected students.`}
      onClose={() => { if (!busyRef.current) onClose?.(); }} closeDisabled={busy} escapeCloses>
      <section aria-label="Distribute saved weekly worksheet" style={{ color: 'var(--text)' }}>
      <p className="text-sm mb-4 break-words" style={{ color: 'var(--text-muted)' }}>{worksheetTitle}</p>
      {sectionsLoading && <p role="status">Loading assigned sections...</p>}
      {sectionsError && <p role="alert">{sectionsError}</p>}
      {!sectionsLoading && !sectionsError && <>
        <label className="block mt-3 text-sm font-medium" htmlFor={sectionInputId}>Section</label>
        <select id={sectionInputId} value={sectionId} disabled={busy}
          className="w-full min-h-11 rounded-lg border px-3" style={{ backgroundColor: 'var(--card-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
          onChange={event => setSectionId(event.target.value)}>
          <option value="">Choose a section</option>
          {sections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}
        </select>
      </>}
      {rosterLoading && <p role="status">Loading active students...</p>}
      {rosterError && <p role="alert">{rosterError}</p>}
      {sectionId && rosterReady && !rosterError && <fieldset className="mt-4">
        <legend className="font-medium">Active students</legend>
        <p role="status" className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>{selectedIds.length} selected</p>
        <div className="max-h-56 overflow-y-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
        {students.map(student => <label key={student.id}
          className="flex items-center gap-3 min-h-12 px-3 py-2 border-b last:border-b-0 cursor-pointer focus-within:ring-2"
          style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
          <span aria-hidden="true" className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold"
            style={{ backgroundColor: 'var(--card2)', color: 'var(--text)' }}>{initials(student.name)}</span>
          <span className="flex-1 min-w-0 break-words">{student.name}</span>
          <input type="checkbox" className="w-4 h-4" checked={selectedIds.includes(student.id)} disabled={busy}
            onChange={event => setSelectedIds(current => event.target.checked
              ? [...current, student.id] : current.filter(id => id !== student.id))} />
        </label>)}
        </div>
        {!students.length && <p>No active students in this section.</p>}
      </fieldset>}
      <label className="block mt-4 text-sm font-medium" htmlFor={dueInputId}>Due date and time (optional, Manila time)</label>
      <Input id={dueInputId} type="datetime-local" min={nextMinuteInManila()} value={dueTime} disabled={busy}
        onChange={event => setDueTime(event.target.value)} />
      {!dueValid && <p role="alert" className="text-sm mt-1" style={{ color: 'var(--red)' }}>Due date and time must be in the future in Manila.</p>}
      {message && <p role={unknownLock || reloadOffered ? 'alert' : 'status'}>{message}</p>}
      {detail && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Details: {detail}</p>}
      {reloadOffered && <Btn variant="outline" onClick={onReload} disabled={busy}>Reload collection</Btn>}
      <div className="flex flex-wrap justify-end gap-2 mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <Btn variant="outline" disabled={busy} onClick={onClose}>Cancel</Btn>
        <Btn disabled={!ready} busy={busy} onClick={reviewSelection}>Review and distribute</Btn>
      </div>
      </section>
    </Modal>
    {review && <ConfirmDialog title="Confirm distribution"
      message={`Day: ${review.dayName}. Section: ${review.sectionName}. Students: ${review.studentIds.length}. Due date and time: ${review.dueLabel}. ${modeNotice}After distributing, this day is locked: its questions can no longer be edited, and the collection can no longer be archived.`}
      confirmLabel="Distribute" onCancel={() => setReview(null)} onConfirm={distribute} />}
  </>;
}
