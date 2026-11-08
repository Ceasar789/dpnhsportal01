// Keep the legacy /grades URL, but show worksheet outcomes rather than a gradebook.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { withRetry } from '../../../../lib/supabaseRetry';
import { CheckCircle2, ClipboardCheck, Inbox, Percent } from 'lucide-react';
import { useToast } from '../hooks';
import { Badge, Btn, Card, StatCard, Toast } from '../shared/ui';
import { useWorksheetAssessment } from '../worksheets/useWorksheetAssessment';
import CheckSubmissionsModal from '../worksheets/CheckSubmissionsModal';
import EncodeScoresModal from '../worksheets/EncodeScoresModal';

const fieldStyle = { color: 'var(--text)', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)' };
// One status per row. Anything submitted but not yet released needs the teacher.
const rowStatus = row => (row.released === true ? 'released' : row.status === 'in_progress' ? 'in_progress' : 'needs_checking');
const STATUS = {
  needs_checking: { label: 'Needs checking', color: '#b45309', bg: 'rgba(217,119,6,0.14)' },
  released: { label: 'Released', color: '#15803d', bg: 'rgba(22,163,74,0.14)' },
  in_progress: { label: 'In progress', color: 'var(--text-muted)', bg: 'var(--card2)' },
};
const CHIPS = [['', 'All'], ['needs_checking', 'Needs checking'], ['released', 'Released'], ['in_progress', 'In progress']];
// Mean of each released row's percentage; rows with no usable total are left out.
const releasedAverage = rows => {
  const percents = rows.filter(row => row.released === true && row.score != null && Number(row.total_points) > 0)
    .map(row => (Number(row.score) / Number(row.total_points)) * 100);
  return percents.length ? `${Math.round(percents.reduce((sum, p) => sum + p, 0) / percents.length)}%` : '-';
};
const scoreName = row => row.score == null || row.total_points == null
  ? 'Not scored' : `${row.score} / ${row.total_points}`;

const GradesTab = () => {
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

  const sectionNames = new Map(assessment.mySections.map(s => [String(s.id), [s.grade_level, s.name].filter(Boolean).join(' · ')]));
  const sectionName = id => sectionNames.get(String(id)) || `Section ID ${id}`;
  const sections = [...new Set(submissions.map(s => s.section_id).filter(Boolean).map(String))];
  const selectedSection = sections.includes(sectionId) ? sectionId : '';
  const sectionRows = submissions.filter(s => !selectedSection || String(s.section_id) === selectedSection);
  const counts = { '': sectionRows.length, needs_checking: 0, released: 0, in_progress: 0 };
  sectionRows.forEach(s => { counts[rowStatus(s)] += 1; });
  const query = search.trim().toLowerCase();
  const visible = sectionRows.filter(s => (!chip || rowStatus(s) === chip)
    && (!query || String(s.name || '').toLowerCase().includes(query)));
  const clearFilters = () => { setChip(''); setSearch(''); setSectionId(''); };
  const refreshScores = () => { setScoreTarget(null); setScoresRefresh(count => count + 1); };
  const closeDialog = setter => { setter(null); refreshScores(); };
  const selectClass = 'block w-full min-h-11 mt-1 px-3 rounded-lg text-sm';

  return <div className="p-4 sm:p-6 min-w-0 space-y-5">
    <Toast toast={toast} />
    <header>
      <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Grading</h1>
      <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Check, release and review worksheet results.</p>
    </header>
    {import.meta.env.DEV && <p className="text-sm">
      <Link to="/teacher-dashboard/essay-review-lab" className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold"
        style={{ color: 'var(--banner-accent)', border: '1px solid var(--border)' }}>Open fictional Essay Review Lab</Link>
      <span className="ml-2" style={{ color: 'var(--text-muted)' }}>Local development only; no real submission is loaded.</span>
    </p>}
    {savedMessage && <p role="status" className="rounded-lg border p-3 text-sm" style={fieldStyle}>{savedMessage}</p>}
    {loading ? <Card className="p-6"><p role="status">Loading your worksheets…</p></Card>
      : listError ? <Card className="p-6"><p role="alert">Could not load your worksheets.</p><Btn variant="outline" onClick={fetchWorksheets}>Retry worksheets</Btn></Card>
      : owned.length === 0 ? <Card className="p-6">No worksheets yet. Create one in Worksheets before recording scores.</Card>
      : <>
        <Card className="p-4 sm:p-5 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Subject
              <select className={selectClass} style={fieldStyle} value={subject} onChange={e => { setSubject(e.target.value); setGrade(''); setWorksheetId(''); setSectionId(''); setChip(''); }}>
                <option value="">All subjects</option>{subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Grade
              <select className={selectClass} style={fieldStyle} value={grade} onChange={e => { setGrade(e.target.value); setWorksheetId(''); setSectionId(''); setChip(''); }}>
                <option value="">All grades</option>{grades.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Worksheet
              <select className={selectClass} style={fieldStyle} value={selected ? String(selected.id) : ''} onChange={e => { setWorksheetId(e.target.value); setSectionId(''); setChip(''); }}>
                {filtered.length === 0 && <option value="">No matching worksheets</option>}
                {filtered.map(w => <option key={w.id} value={String(w.id)}>{w.title || 'Untitled worksheet'}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Section
              <select className={selectClass} style={fieldStyle} value={selectedSection} onChange={e => { setSectionId(e.target.value); setChip(''); }}>
                <option value="">All sections</option>{sections.map(id => <option key={id} value={id}>{sectionName(id)}</option>)}
              </select></label>
          </div>
        </Card>
        {!selected ? <Card className="p-6">No worksheets match these filters.</Card> : <>
          <Card className="p-4 sm:p-5 min-w-0">
            <div className="flex flex-wrap justify-between items-start gap-3">
              <div className="min-w-0"><h2 className="font-semibold break-words" style={{ color: 'var(--text)' }}>{selected.title || 'Untitled worksheet'}</h2>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{selected.subject || 'Subject unavailable'} · {selected.grade_level || 'Grade unavailable'}</p></div>
              <div className="flex flex-wrap gap-2">
                <Btn variant="outline" onClick={() => setChecking(selected)}>Check submissions</Btn>
                <Btn variant="outline" onClick={() => setEncoding(selected)}>Encode paper scores</Btn>
              </div>
            </div>
          </Card>
          {scoresLoading || scoreTarget !== selected.id ? <Card className="p-6"><p role="status">Loading worksheet submissions…</p></Card>
            : scoresError ? <Card className="p-6"><p role="alert">Could not load worksheet submissions. Scores are hidden until the read succeeds.</p>
              <Btn variant="outline" onClick={refreshScores}>Retry submissions</Btn></Card>
            : <>
              <section aria-label="Summary" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard label="Submitted" value={counts.needs_checking + counts.released} icon={Inbox} color="#2563eb" />
                <StatCard label="Needs checking" value={counts.needs_checking} icon={ClipboardCheck} color="#d97706" />
                <StatCard label="Released" value={counts.released} icon={CheckCircle2} color="#16a34a" />
                <StatCard label="Average (released)" value={releasedAverage(sectionRows)} icon={Percent} color="#7c3aed" />
              </section>
              <Card className="p-4 sm:p-5 min-w-0 space-y-3">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
                  {CHIPS.map(([value, label]) => <button key={label} type="button" aria-pressed={chip === value}
                    onClick={() => setChip(value)} className="min-h-10 px-3 rounded-full text-sm font-semibold"
                    style={chip === value ? { color: '#ffffff', backgroundColor: 'var(--banner-accent)', border: '1px solid var(--banner-accent)' }
                      : { color: 'var(--text)', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                    {label} <span>({counts[value]})</span></button>)}
                </div>
                <input type="search" aria-label="Search students" placeholder="Search students by name" value={search}
                  onChange={e => setSearch(e.target.value)} className="block w-full min-h-11 px-3 rounded-lg text-sm" style={fieldStyle} />
              </Card>
              <p role="status" className="text-sm" style={{ color: 'var(--text-muted)' }}>{visible.length} of {submissions.length} submissions</p>
              {visible.length === 0 ? <Card className="p-6">{submissions.length
                ? <div className="flex flex-wrap items-center gap-3"><p>No students match these filters.</p>
                  <Btn variant="outline" onClick={clearFilters}>Clear filters</Btn></div>
                : 'No submissions for this worksheet yet.'}</Card>
                : <ul className="space-y-2" aria-label="Worksheet submissions">{visible.map(s => <li key={s.id}><Card className="p-4 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                    <div className="min-w-0"><p className="font-semibold break-words" style={{ color: 'var(--text)' }}>{s.name || 'Student name unavailable'}</p>
                      <p className="text-sm break-all" style={{ color: 'var(--text-muted)' }}>{s.section_id ? sectionName(s.section_id) : 'Section unavailable'} · {s.source === 'manual' ? 'Paper score' : s.source === 'online' ? 'Online submission' : 'Source unavailable'}</p></div>
                    <div className="sm:text-right shrink-0"><p className="font-semibold" style={{ color: 'var(--text)' }}>{scoreName(s)}</p>
                      <p className="mt-1"><Badge color={STATUS[rowStatus(s)].color} bg={STATUS[rowStatus(s)].bg}>{STATUS[rowStatus(s)].label}</Badge></p></div>
                  </div>
                </Card></li>)}</ul>}
            </>}
        </>}
      </>}
    {checking && owned.some(w => w.id === checking.id) && <CheckSubmissionsModal worksheet={checking} loadItems={assessment.loadItems}
      loadSubmissions={assessment.loadSubmissions} loadAnswers={assessment.loadAnswers} saveMarks={assessment.saveMarks}
      releaseScore={assessment.releaseScore} onClose={() => closeDialog(setChecking)} />}
    {encoding && owned.some(w => w.id === encoding.id) && <EncodeScoresModal worksheet={encoding} postings={assessment.postings}
      sections={assessment.mySections} loadClassList={assessment.loadClassList}
      loadSubmissions={assessment.loadSubmissions} encodeManualScore={assessment.encodeManualScore}
      onSaved={setSavedMessage} onClose={() => closeDialog(setEncoding)} />}
  </div>;
};

export default GradesTab;
