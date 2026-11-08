// Keep the legacy /grades URL, but show worksheet outcomes rather than a gradebook.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { withRetry } from '../../../../lib/supabaseRetry';
import { useToast } from '../hooks';
import { Btn, Card, Toast } from '../shared/ui';
import { useWorksheetAssessment } from '../worksheets/useWorksheetAssessment';
import CheckSubmissionsModal from '../worksheets/CheckSubmissionsModal';
import EncodeScoresModal from '../worksheets/EncodeScoresModal';

const fieldStyle = { color: 'var(--text)', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)' };
const statusName = status => ({ in_progress: 'Pending', submitted: 'Submitted', checked: 'Reviewed' })[status]
  || (status ? status.replaceAll('_', ' ') : 'Status unavailable');
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
  const [status, setStatus] = useState('');
  const [release, setRelease] = useState('');
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
  const visible = submissions.filter(s => (!selectedSection || String(s.section_id) === selectedSection)
    && (!status || s.status === status)
    && (!release || (release === 'released' ? s.released === true : s.released !== true)));
  const refreshScores = () => { setScoreTarget(null); setScoresRefresh(count => count + 1); };
  const closeDialog = setter => { setter(null); refreshScores(); };
  const selectClass = 'block w-full min-h-11 mt-1 px-3 rounded-lg text-sm';

  return <div className="p-4 sm:p-6 min-w-0 space-y-5">
    <Toast toast={toast} />
    <header>
      <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Worksheet Scores</h1>
      <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Review your worksheet submissions and released scores.</p>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Subject
              <select className={selectClass} style={fieldStyle} value={subject} onChange={e => { setSubject(e.target.value); setGrade(''); setWorksheetId(''); setSectionId(''); }}>
                <option value="">All subjects</option>{subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Grade
              <select className={selectClass} style={fieldStyle} value={grade} onChange={e => { setGrade(e.target.value); setWorksheetId(''); setSectionId(''); }}>
                <option value="">All grades</option>{grades.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Worksheet
              <select className={selectClass} style={fieldStyle} value={selected ? String(selected.id) : ''} onChange={e => { setWorksheetId(e.target.value); setSectionId(''); }}>
                {filtered.length === 0 && <option value="">No matching worksheets</option>}
                {filtered.map(w => <option key={w.id} value={String(w.id)}>{w.title || 'Untitled worksheet'}</option>)}
              </select>
            </label>
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
              <Card className="p-4 sm:p-5 min-w-0"><div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Section
                  <select className={selectClass} style={fieldStyle} value={selectedSection} onChange={e => setSectionId(e.target.value)}>
                    <option value="">All sections</option>{sections.map(id => <option key={id} value={id}>{sectionName(id)}</option>)}
                  </select></label>
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Submission status
                  <select className={selectClass} style={fieldStyle} value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="">All statuses</option><option value="in_progress">Pending</option><option value="submitted">Submitted</option><option value="checked">Reviewed</option>
                  </select></label>
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Release status
                  <select className={selectClass} style={fieldStyle} value={release} onChange={e => setRelease(e.target.value)}>
                    <option value="">All release states</option><option value="released">Released</option><option value="unreleased">Not released</option>
                  </select></label>
              </div></Card>
              <p role="status" className="text-sm" style={{ color: 'var(--text-muted)' }}>{visible.length} of {submissions.length} submissions</p>
              {visible.length === 0 ? <Card className="p-6">{submissions.length ? 'No submissions match these filters.' : 'No submissions for this worksheet yet.'}</Card>
                : <ul className="space-y-2" aria-label="Worksheet submissions">{visible.map(s => <li key={s.id}><Card className="p-4 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                    <div className="min-w-0"><p className="font-semibold break-words" style={{ color: 'var(--text)' }}>{s.name || 'Student name unavailable'}</p>
                      <p className="text-sm break-all" style={{ color: 'var(--text-muted)' }}>{s.section_id ? sectionName(s.section_id) : 'Section unavailable'} · {s.source === 'manual' ? 'Paper score' : s.source === 'online' ? 'Online submission' : 'Source unavailable'}</p></div>
                    <div className="sm:text-right shrink-0"><p className="font-semibold" style={{ color: 'var(--text)' }}>{scoreName(s)}</p>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{statusName(s.status)} · {s.released ? 'Released' : 'Not released'}</p></div>
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
