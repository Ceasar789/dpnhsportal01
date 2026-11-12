// ============================================
// FILE: src/components/clarity/teacher/ClarityTeacherGradingTab.jsx
// The Teacher Grading tab in Clarity (final design: master-detail, real data
// only). The same reads, filters and dialogs as the classic GradesTab: the
// worksheet list, each worksheet's submissions and its assignee roster (for
// "Not started"), the status chips, search and the summary. The left list
// shows each student; selecting one shows it on the right (selection only).
// Checking, marking and releasing happen in the same CheckSubmissionsModal,
// and paper scores in the same EncodeScoresModal, exactly as before; the
// design's per-question scores live in that dialog (they need its own read).
//
// TEMPORARY word-for-word copies from pages/dashboards/teacher/tabs/GradesTab.jsx
// (source-parity tested in ClarityTeacherT3Sources.test.js); after the defense
// the classic tab and this one should share them. No substitutions.
//   - rowStatus, :17-18
//   - CHIPS, isLate, releasedAverage, scoreName, :26-36
//   - the state, reads, effects and derived lists, :39-164
// ============================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../config/supabase';
import { withRetry } from '../../../lib/supabaseRetry';
import { formatDateTime, LOCALE } from '../../../lib/formatDate';
import { useToast } from '../../../pages/dashboards/teacher/hooks';
import { Toast } from '../../../pages/dashboards/teacher/shared/ui';
import { useWorksheetAssessment } from '../../../pages/dashboards/teacher/worksheets/useWorksheetAssessment';
import CheckSubmissionsModal from '../../../pages/dashboards/teacher/worksheets/CheckSubmissionsModal';
import EncodeScoresModal from '../../../pages/dashboards/teacher/worksheets/EncodeScoresModal';
import ProgressRing from '../charts/ProgressRing';

// ---- TEMPORARY copy (GradesTab.jsx:17-18) ----
const rowStatus = row => (row.notStarted ? 'not_started' : row.released === true ? 'released'
  : row.status === 'in_progress' ? 'in_progress' : 'needs_checking');
// ---- end of the copy ----
// ---- TEMPORARY copy (GradesTab.jsx:26-36) ----
const CHIPS = [['', 'All'], ['needs_checking', 'Needs checking'], ['released', 'Released'], ['in_progress', 'In progress'],
  ['not_started', 'Not started']];
const isLate = row => !row.notStarted && row.status !== 'in_progress' && row.is_late === true;
// Mean of each released row's percentage; rows with no usable total are left out.
const releasedAverage = rows => {
  const percents = rows.filter(row => row.released === true && row.score != null && Number(row.total_points) > 0)
    .map(row => (Number(row.score) / Number(row.total_points)) * 100);
  return percents.length ? `${Math.round(percents.reduce((sum, p) => sum + p, 0) / percents.length)}%` : '-';
};
const scoreName = row => row.score == null || row.total_points == null
  ? 'Not scored' : `${row.score} / ${row.total_points}`;
// ---- end of the copy ----

// The classic status labels, as Clarity pill tones.
const STATUS = {
  needs_checking: ['Needs checking', 'wa'],
  released: ['Released', 'ok'],
  in_progress: ['In progress', ''],
  not_started: ['Not started', ''],
};
const StatusPill = ({ row }) => {
  const [label, tone] = STATUS[rowStatus(row)];
  return <span className={`x-badge ${tone}`}>{label}</span>;
};
// "Nov 10": the submitted day, in the same local time as formatDateTime.
const submittedDay = at => { const d = at ? new Date(at) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' }) : ''; };
// The row's line (the design): the score when scored, else the submitted day when known.
const rowLine = s => {
  if (s.notStarted) return 'No submission yet';
  const day = submittedDay(s.submitted_at);
  return s.score == null && s.total_points == null && day ? `Submitted ${day}` : scoreName(s);
};
const sourceText = s => (s.source === 'manual' ? 'Paper score' : s.source === 'online' ? 'Online submission' : 'Source unavailable');

const ClarityTeacherGradingTab = () => {
  // ---- TEMPORARY copy (GradesTab.jsx:39-164) ----
  const { userData } = useAuth();
  const uid = userData?.uid;
  const { toast, showToast } = useToast();
  const assessment = useWorksheetAssessment(showToast);
  const [worksheets, setWorksheets] = useState([]);
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [worksheetId, setWorksheetId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [chip, setChip] = useState('');
  const [search, setSearch] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const [scoreTarget, setScoreTarget] = useState(null);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [scoresError, setScoresError] = useState(false);
  const [scoresRefresh, setScoresRefresh] = useState(0);
  const [checking, setChecking] = useState(null);
  const [encoding, setEncoding] = useState(null);
  const [savedMessage, setSavedMessage] = useState('');
  const listSeq = useRef(0);
  const scoresSeq = useRef(0);
  // Roster: 'loading' | 'ok' | 'failed'. Read separately so a failure never hides submissions.
  const [roster, setRoster] = useState({ target: null, state: 'loading', rows: [] });
  const [rosterRefresh, setRosterRefresh] = useState(0);
  const rosterSeq = useRef(0);

  const fetchWorksheets = useCallback(async () => {
    const seq = ++listSeq.current;
    setLoading(true);
    setListError(false);
    setOwner(null);
    setWorksheets([]);
    if (!uid) { setListError(true); setLoading(false); return; }
    // Reuse WorksheetsTab's owned-list query. No general grades read or write.
    const { data, error } = await withRetry(
      () => supabase.from('worksheets').select('*').eq('teacher_id', uid)
        .order('created_at', { ascending: false }),
      { label: 'Teacher worksheets for scores fetch' }
    );
    if (seq !== listSeq.current) return;
    if (error) setListError(true);
    else { setWorksheets(data || []); setOwner(uid); }
    setLoading(false);
  }, [uid]);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) fetchWorksheets(); });
    const sequence = listSeq;
    return () => { active = false; ++sequence.current; };
  }, [fetchWorksheets]);

  const owned = useMemo(() => owner === uid ? worksheets : [], [owner, uid, worksheets]);
  const subjects = useMemo(() => [...new Set(owned.map(w => w.subject).filter(Boolean))].sort(), [owned]);
  const subjectRows = owned.filter(w => !subject || w.subject === subject);
  const grades = [...new Set(subjectRows.map(w => w.grade_level).filter(Boolean))].sort();
  const filtered = subjectRows.filter(w => !grade || w.grade_level === grade);
  const selected = filtered.find(w => String(w.id) === worksheetId) || filtered[0];
  const selectedScoreId = selected?.id;
  const loadSubmissions = assessment.loadSubmissions;

  useEffect(() => {
    let active = true;
    const sequence = scoresSeq;
    const seq = ++sequence.current;
    Promise.resolve().then(async () => {
      if (!active) return;
      setScoreTarget(selectedScoreId ?? null);
      setSubmissions([]);
      setScoresError(false);
      if (!selectedScoreId || owner !== uid) { setScoresLoading(false); return; }
      setScoresLoading(true);
      const rows = await loadSubmissions(selectedScoreId);
      if (!active || seq !== sequence.current) return;
      if (rows === null) setScoresError(true);
      else setSubmissions(rows);
      setScoresLoading(false);
    });
    return () => { active = false; ++sequence.current; };
  }, [selectedScoreId, owner, uid, loadSubmissions, scoresRefresh]);

  const loadAssigneeRoster = assessment.loadAssigneeRoster;
  useEffect(() => {
    let active = true;
    const sequence = rosterSeq;
    const seq = ++sequence.current;
    Promise.resolve().then(async () => {
      if (!active) return;
      setRoster({ target: selectedScoreId ?? null, state: 'loading', rows: [] });
      if (!selectedScoreId || owner !== uid) return;
      let rows;
      try { rows = await loadAssigneeRoster(selectedScoreId); } catch { rows = null; }
      if (!active || seq !== sequence.current) return;
      setRoster(Array.isArray(rows) ? { target: selectedScoreId, state: 'ok', rows } : { target: selectedScoreId, state: 'failed', rows: [] });
    });
    return () => { active = false; ++sequence.current; };
  }, [selectedScoreId, owner, uid, loadAssigneeRoster, rosterRefresh]);

  const sectionNames = new Map(assessment.mySections.map(s => [String(s.id), [s.grade_level, s.name].filter(Boolean).join(' · ')]));
  const sectionName = id => sectionNames.get(String(id)) || `Section ID ${id}`;
  // Assignees with no submission become Not started rows; a submission always wins.
  const rosterOk = roster.state === 'ok' && roster.target === selected?.id;
  const startedIds = new Set(submissions.map(s => String(s.student_id)));
  const notStarted = [];
  if (rosterOk) {
    roster.rows.forEach(a => {
      const id = String(a.student_id);
      if (startedIds.has(id)) return;
      startedIds.add(id);
      notStarted.push({ id: `not-started-${id}`, student_id: a.student_id, section_id: a.section_id, name: a.name, notStarted: true });
    });
  }
  const allRows = [...submissions, ...notStarted];
  const sections = [...new Set(allRows.map(s => s.section_id).filter(Boolean).map(String))];
  const selectedSection = sections.includes(sectionId) ? sectionId : '';
  const sectionRows = allRows.filter(s => !selectedSection || String(s.section_id) === selectedSection);
  const counts = { '': sectionRows.length, needs_checking: 0, released: 0, in_progress: 0, not_started: 0 };
  sectionRows.forEach(s => { counts[rowStatus(s)] += 1; });
  const query = search.trim().toLowerCase();
  const visible = sectionRows.filter(s => (!chip || rowStatus(s) === chip)
    && (!query || String(s.name || '').toLowerCase().includes(query)));
  const clearFilters = () => { setChip(''); setSearch(''); setSectionId(''); };
  const refreshScores = () => { setScoreTarget(null); setScoresRefresh(count => count + 1); };
  const closeDialog = setter => { setter(null); refreshScores(); };
  // ---- end of the copy ----

  // Selection only: the first visible row until one is picked. Nothing is called.
  const [selId, setSelId] = useState(null);
  const current = visible.find(s => s.id === selId) || visible[0] || null;
  const nextRow = current ? visible[visible.indexOf(current) + 1] || null : null;
  const percent = current && !current.notStarted && current.score != null && Number(current.total_points) > 0
    ? (Number(current.score) / Number(current.total_points)) * 100 : null;
  const summary = selected && !(scoresLoading || scoreTarget !== selected.id) && !scoresError ? [
    ...(rosterOk ? [['Assigned', new Set(sectionRows.map(s => String(s.student_id))).size]] : []),
    ['Submitted', counts.needs_checking + counts.released], ['Needs checking', counts.needs_checking],
    ['Released', counts.released], ...(rosterOk ? [['Not started', counts.not_started]] : []),
    ['Average (released)', releasedAverage(sectionRows)],
  ] : null;

  return (
    <div className="x-tgr">
      <Toast toast={toast} />
      <div className="x-head x-ov-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="x-h1">Grading</h1>
          <p className="x-sub">Review one submission at a time.</p>
        </div>
        {selected && assessment.paperScoreEncodingAvailable === true && (
          <div className="x-act">
            <button type="button" className="x-btn" onClick={() => setEncoding(selected)}>Encode paper scores</button>
          </div>
        )}
      </div>

      {import.meta.env.DEV && (
        <p className="x-cs x-tgr-dev">
          <Link to="/teacher-dashboard/essay-review-lab" className="x-btn gh">Open fictional Essay Review Lab</Link>
          <span>Local development only; no real submission is loaded.</span>
        </p>
      )}
      {savedMessage && <p role="status" className="x-card x-pad x-tgr-saved">{savedMessage}</p>}

      {loading ? <p className="x-card x-empty" role="status">Loading your worksheets…</p>
        : listError ? (
          <div className="x-card x-pad x-rail">
            <span role="alert">Could not load your worksheets.</span>
            <button type="button" className="x-btn" onClick={fetchWorksheets}>Retry worksheets</button>
          </div>
        )
        : owned.length === 0 ? <p className="x-card x-empty">No worksheets yet. Create one in Worksheets before recording scores.</p>
        : <>
          <div className="x-card x-pad x-tgr-filters">
            <label className="x-label">Subject
              <select className="x-select" value={subject} onChange={e => { setSubject(e.target.value); setGrade(''); setWorksheetId(''); setSectionId(''); setChip(''); }}>
                <option value="">All subjects</option>{subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="x-label">Grade
              <select className="x-select" value={grade} onChange={e => { setGrade(e.target.value); setWorksheetId(''); setSectionId(''); setChip(''); }}>
                <option value="">All grades</option>{grades.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
            <label className="x-label">Worksheet
              <select className="x-select" value={selected ? String(selected.id) : ''} onChange={e => { setWorksheetId(e.target.value); setSectionId(''); setChip(''); }}>
                {filtered.length === 0 && <option value="">No matching worksheets</option>}
                {filtered.map(w => <option key={w.id} value={String(w.id)}>{w.title || 'Untitled worksheet'}</option>)}
              </select>
            </label>
            <label className="x-label">Section
              <select className="x-select" value={selectedSection} onChange={e => { setSectionId(e.target.value); setChip(''); }}>
                <option value="">All sections</option>{sections.map(id => <option key={id} value={id}>{sectionName(id)}</option>)}
              </select>
            </label>
          </div>

          {!selected ? <p className="x-card x-empty">No worksheets match these filters.</p> : <>
            <div className="x-tgr-ws">
              <div style={{ minWidth: 0 }}>
                <h2 className="x-ct">{selected.title || 'Untitled worksheet'}</h2>
                <p className="x-cs">{selected.subject || 'Subject unavailable'} · {selected.grade_level || 'Grade unavailable'}</p>
              </div>
              <button type="button" className="x-btn pri" onClick={() => setChecking(selected)}>Check submissions</button>
            </div>

            {scoresLoading || scoreTarget !== selected.id ? <p className="x-card x-empty" role="status">Loading worksheet submissions…</p>
              : scoresError ? (
                <div className="x-card x-pad x-rail">
                  <span role="alert">Could not load worksheet submissions. Scores are hidden until the read succeeds.</span>
                  <button type="button" className="x-btn" onClick={refreshScores}>Retry submissions</button>
                </div>
              ) : <>
                <section aria-label="Summary" className="x-tgr-summary">
                  <dl>{summary.map(([label, value]) => <div key={label} className="x-card"><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
                </section>
                {roster.state === 'failed' && roster.target === selected.id && (
                  <p role="alert" className="x-cs x-tgr-roster">
                    Couldn't load students who haven't started.
                    <button type="button" className="x-btn" onClick={() => setRosterRefresh(count => count + 1)}>Retry</button>
                  </p>
                )}

                <div className="x-tgr-layout">
                  <section className="x-card x-tgr-list" aria-label="Students">
                    <div className="x-tgr-tools">
                      <label className="x-search">
                        <Search size={16} aria-hidden="true" />
                        <input type="search" aria-label="Search students" placeholder="Search students by name" value={search} onChange={e => setSearch(e.target.value)} />
                      </label>
                      <div className="x-chips" role="group" aria-label="Filter by status">
                        {CHIPS.filter(([value]) => value !== 'not_started' || rosterOk).map(([value, label]) => (
                          <button key={label} type="button" className={`x-chip${chip === value ? ' on' : ''}`} aria-pressed={chip === value}
                            onClick={() => setChip(value)}>{label} <span className="n">({counts[value]})</span></button>
                        ))}
                      </div>
                      <p role="status" className="x-cs">{visible.length} of {allRows.length} students</p>
                    </div>
                    {visible.length === 0 ? (
                      <div className="x-empty">{allRows.length
                        ? <><p>No students match these filters.</p><button type="button" className="x-btn" onClick={clearFilters}>Clear filters</button></>
                        : 'No submissions for this worksheet yet.'}</div>
                    ) : (
                      <ul className="x-tgr-rows" aria-label="Worksheet submissions">
                        {visible.map(s => (
                          <li key={s.id}>
                            <button type="button" className={`x-tgr-row${current?.id === s.id ? ' on' : ''}`} aria-pressed={current?.id === s.id} onClick={() => setSelId(s.id)}>
                              <span className="x-tgr-who">
                                <b>{s.name || 'Student name unavailable'}</b>
                                <span className="x-cs">{rowLine(s)}</span>
                              </span>
                              <span className="x-news-pills">
                                <StatusPill row={s} />
                                {isLate(s) && <span className="x-badge er">Late</span>}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="x-card x-pad x-tgr-detail" aria-label="Selected student">
                    {current ? <>
                      <div className="x-krow">
                        <div style={{ minWidth: 0 }}>
                          <p className="x-cs">Reviewing</p>
                          <h2 className="x-ct x-tgr-name">{current.name || 'Student name unavailable'}</h2>
                        </div>
                        <span className="x-news-pills"><StatusPill row={current} />{isLate(current) && <span className="x-badge er">Late</span>}</span>
                      </div>
                      {percent !== null && drawable(percent) ? (
                        <div className={`x-tgr-ring${scoreName(current).length > 7 ? ' x-tgr-ring-long' : ''}`}><ProgressRing value={percent} label="Score" detail={scoreName(current)} center={scoreName(current)} /></div>
                      ) : (
                        <p className="x-tgr-score">{current.notStarted ? 'No submission yet' : scoreName(current)}</p>
                      )}
                      <dl className="x-tgr-facts">
                        <div><dt>Score</dt><dd>{current.notStarted ? 'No submission yet' : scoreName(current)}</dd></div>
                        <div><dt>Section</dt><dd>{current.section_id ? sectionName(current.section_id) : 'Section unavailable'}</dd></div>
                        {!current.notStarted && <div><dt>Source</dt><dd>{sourceText(current)}</dd></div>}
                        {isLate(current) && current.submitted_at && <div><dt>Submitted</dt><dd>{formatDateTime(current.submitted_at)}</dd></div>}
                      </dl>
                      <div className="x-tgr-act">
                        <button type="button" className="x-btn pri" onClick={() => setChecking(selected)}>Check submissions</button>
                        <button type="button" className="x-btn gh" disabled={!nextRow} onClick={() => nextRow && setSelId(nextRow.id)}>Next student</button>
                      </div>
                    </> : <p className="x-empty">Select a student to view</p>}
                  </section>
                </div>
              </>}
          </>}
        </>}

      {checking && owned.some(w => w.id === checking.id) && <CheckSubmissionsModal worksheet={checking} loadItems={assessment.loadItems}
        loadSubmissions={assessment.loadSubmissions} loadAnswers={assessment.loadAnswers} saveMarks={assessment.saveMarks}
        releaseScore={assessment.releaseScore} onClose={() => closeDialog(setChecking)}
        {...(assessment.paperScoreEncodingAvailable === true ? { paperScoresAvailable: true } : {})} />}
      {assessment.paperScoreEncodingAvailable === true && encoding && owned.some(w => w.id === encoding.id) && <EncodeScoresModal worksheet={encoding} postings={assessment.postings}
        sections={assessment.mySections} loadClassList={assessment.loadClassList}
        loadSubmissions={assessment.loadSubmissions} encodeManualScore={assessment.encodeManualScore}
        onSaved={setSavedMessage} onClose={() => closeDialog(setEncoding)} />}
    </div>
  );
};

// A ring can only draw 0-100; any other recorded value shows as the score text.
const drawable = p => p >= 0 && p <= 100;

export default ClarityTeacherGradingTab;
