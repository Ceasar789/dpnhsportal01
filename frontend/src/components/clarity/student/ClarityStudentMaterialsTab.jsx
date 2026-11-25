// ============================================
// FILE: src/components/clarity/student/ClarityStudentMaterialsTab.jsx
// Student Learning Materials (4e, design p21, Student #25, Q5): the teachers'
// materials for the student's own grade and the subjects they are scheduled
// for. OFF until VITE_STUDENT_LEARNING_MATERIALS_ENABLED=1, because today's
// row level security lets only the owning teacher read learning_materials and
// its files; the read policy is the proposed migration autorun/sql/4e.
// Files open through a 5-minute signed link; links only when they are http(s).
// U-S5 (design p21): subject chips with counts, the "only your section and
// subjects" note, cards with subject, title, description, teacher and date,
// Download or Open link. Teacher names come from the proposed U-S5 function;
// without it the card shows no name.
// ============================================
import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, FileText, Info, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../../../config/supabase';
import { normalizeGradeLevel } from '../../../lib/academicRules';
import { useStudentData } from '../../../pages/dashboards/student/StudentDataContext';
import { MATERIALS_BUCKET } from '../teacher/materials/materialsApi';
import { safeLink } from '../teacher/materials/materialRules';
import { Skeleton, SkeletonGroup } from '../../ui/Skeleton';
import { listMaterialTeachers, listStudentMaterials } from './studentMaterials';

const POSTED = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: '2-digit' });
const postedOn = (value) => {
  const at = value ? new Date(value) : null;
  return at && !Number.isNaN(at.getTime()) ? POSTED.format(at) : '';
};

export default function ClarityStudentMaterialsTab() {
  const { graph, loading: graphLoading } = useStudentData();
  const grade = graph && !graph.fatalError ? normalizeGradeLevel(graph.enrolments?.[0]?.sections?.grade_level) : null;
  const sectionName = graph && !graph.fatalError ? graph.enrolments?.[0]?.sections?.name?.trim() || null : null;
  const [teachers, setTeachers] = useState(() => new Map());
  const subjectIds = useMemo(() => (graph?.cardSubjectIds instanceof Set ? [...graph.cardSubjectIds] : []), [graph]);
  const [state, setState] = useState({ status: 'loading', rows: [] });
  const [subject, setSubject] = useState('');
  const [query, setQuery] = useState('');
  const [reload, setReload] = useState(0);
  const [opening, setOpening] = useState(null);
  const [openError, setOpenError] = useState('');

  useEffect(() => {
    if (graphLoading) return undefined;
    let active = true;
    listStudentMaterials({ grade, subjectIds })
      .then(rows => { if (active) setState({ status: 'ready', rows }); })
      .catch(() => { if (active) setState({ status: 'error', rows: [] }); });
    listMaterialTeachers().then(names => { if (active) setTeachers(names); });
    return () => { active = false; };
  }, [graphLoading, grade, subjectIds, reload]);

  // [subject id, name, count], A-Z.
  const chips = useMemo(() => [...state.rows.filter(r => r.subjects?.name).reduce((map, r) => {
    const entry = map.get(r.subject_id) || [r.subject_id, r.subjects.name, 0];
    entry[2] += 1;
    return map.set(r.subject_id, entry);
  }, new Map()).values()].sort((a, b) => a[1].localeCompare(b[1])), [state.rows]);
  // U-PDF-S (design p21): search over title, description and subject, with the chip.
  const needle = query.trim().toLocaleLowerCase();
  const shown = state.rows.filter(r => (!subject || r.subject_id === subject)
    && (!needle || [r.title, r.description, r.subjects?.name].some(v => String(v || '').toLocaleLowerCase().includes(needle))));
  // One colour per subject for the card's top bar (the chips' order, five tones).
  const tone = id => (chips.findIndex(([chipId]) => chipId === id) % 5) + 1;

  const openFile = async (row) => {
    setOpening(row.id);
    setOpenError('');
    const tab = window.open('about:blank', '_blank');
    try {
      const { data, error } = await supabase.storage.from(MATERIALS_BUCKET)
        .createSignedUrl(row.file_path, 300, { download: row.file_name || true });
      if (error || !data?.signedUrl) throw new Error('no link');
      if (tab) { tab.opener = null; tab.location.href = data.signedUrl; }
    } catch {
      tab?.close?.();
      setOpenError('The file could not be opened. Try again.');
    }
    setOpening(null);
  };

  return (
    <div className="x-tlm">
      <div className="x-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="x-h1">Learning Materials</h1>
          <p className="x-sub">{['Slides, notes and links from your teachers', grade, sectionName].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="x-act">
          <label className="x-search x-slm-search">
            <Search size={16} aria-hidden="true" />
            <span className="x-sr">Search materials</span>
            <input type="search" placeholder="Search materials..." autoComplete="off" value={query} onChange={e => setQuery(e.target.value)} />
          </label>
          <button type="button" className="x-iconbtn" onClick={() => { setState({ status: 'loading', rows: [] }); setReload(k => k + 1); }} aria-label="Refresh learning materials">
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="x-slm-note" role="note"><Info size={16} aria-hidden="true" /> You only see materials your teachers posted to your section and subjects.</p>
      {openError && <p role="alert" className="x-cs">{openError}</p>}
      {chips.length > 1 && (
        <div className="x-tlm-chips" role="group" aria-label="Filter by subject">
          <button type="button" className={`x-chip${subject ? '' : ' on'}`} aria-pressed={!subject} onClick={() => setSubject('')}>All <span className="x-slm-n">{state.rows.length}</span></button>
          {chips.map(([id, name, count]) => (
            <button key={id} type="button" className={`x-chip${subject === id ? ' on' : ''}`} aria-pressed={subject === id} onClick={() => setSubject(id)}>{name} <span className="x-slm-n">{count}</span></button>
          ))}
        </div>
      )}
      {state.status === 'loading' ? (
        <><p className="x-sr" role="status">Loading learning materials…</p>
          <SkeletonGroup className="x-tlm-grid">{[0, 1, 2].map(i => <div key={i} className="x-card x-pad"><Skeleton inline h="0.8em" w="60%" /></div>)}</SkeletonGroup></>
      ) : state.status === 'error' ? (
        <div className="x-card x-pad x-rail">
          <span role="alert">Learning materials could not be loaded. Check your connection and try again.</span>
          <button type="button" className="x-btn" onClick={() => { setState({ status: 'loading', rows: [] }); setReload(k => k + 1); }}>Retry</button>
        </div>
      ) : shown.length === 0 && state.rows.length > 0 ? (
        <div className="x-card x-pad x-tlm-none">
          <b>No materials match your search.</b>
          <button type="button" className="x-btn" onClick={() => { setQuery(''); setSubject(''); }}>Clear search</button>
        </div>
      ) : shown.length === 0 ? (
        <div className="x-card x-pad x-tlm-none">
          <b>No learning materials yet.</b>
          <span className="x-cs">When your teachers add files or links for your subjects, they will show here.</span>
        </div>
      ) : (
        <ul className="x-tlm-grid x-slm-grid" aria-label="Learning materials">
          {shown.map(row => {
            const link = row.kind === 'link' ? safeLink(row.link_url) : null;
            const byline = [teachers.get(row.teacher_id), postedOn(row.created_at)].filter(Boolean).join(' · ');
            return (
              <li key={row.id} className="x-card x-slm-card">
                <span className={`x-slm-bar c${tone(row.subject_id)}`} aria-hidden="true" />
                <div className="x-slm-top">
                  <span className="x-ico" aria-hidden="true">{row.kind === 'link' ? <ExternalLink size={16} /> : <FileText size={16} />}</span>
                  {row.subjects?.name && <span className="x-badge in">{row.subjects.name}</span>}
                </div>
                <h2 className="x-ct">{row.title}</h2>
                {row.description && <p className="x-cs x-slm-desc">{row.description}</p>}
                {byline && <p className="x-cs x-slm-by">{byline}</p>}
                <div className="x-slm-act">
                  {link ? (
                    <a className="x-btn" href={link} target="_blank" rel="noopener noreferrer" aria-label={`Open link ${row.title} (opens in a new tab)`}>
                      <ExternalLink size={16} aria-hidden="true" /> Open link
                    </a>
                  ) : row.file_path ? (
                    <button type="button" className="x-btn" onClick={() => openFile(row)} disabled={opening === row.id}
                      aria-busy={opening === row.id ? 'true' : undefined} aria-label={`Download ${row.title}`}>
                      <Download size={16} aria-hidden="true" /> {opening === row.id ? 'Preparing…' : 'Download'}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
