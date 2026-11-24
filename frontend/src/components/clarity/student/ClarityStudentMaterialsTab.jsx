// ============================================
// FILE: src/components/clarity/student/ClarityStudentMaterialsTab.jsx
// Student Learning Materials (4e, design p21, Student #25, Q5): the teachers'
// materials for the student's own grade and the subjects they are scheduled
// for. OFF until VITE_STUDENT_LEARNING_MATERIALS_ENABLED=1, because today's
// row level security lets only the owning teacher read learning_materials and
// its files; the read policy is the proposed migration autorun/sql/4e.
// Files open through a 5-minute signed link; links only when they are http(s).
// ============================================
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText, RefreshCw } from 'lucide-react';
import { supabase } from '../../../config/supabase';
import { normalizeGradeLevel } from '../../../lib/academicRules';
import { useStudentData } from '../../../pages/dashboards/student/StudentDataContext';
import { MATERIALS_BUCKET } from '../teacher/materials/materialsApi';
import { safeLink } from '../teacher/materials/materialRules';
import { Skeleton, SkeletonGroup } from '../../ui/Skeleton';
import { listStudentMaterials } from './studentMaterials';

export default function ClarityStudentMaterialsTab() {
  const { graph, loading: graphLoading } = useStudentData();
  const grade = graph && !graph.fatalError ? normalizeGradeLevel(graph.enrolments?.[0]?.sections?.grade_level) : null;
  const subjectIds = useMemo(() => (graph?.cardSubjectIds instanceof Set ? [...graph.cardSubjectIds] : []), [graph]);
  const [state, setState] = useState({ status: 'loading', rows: [] });
  const [subject, setSubject] = useState('');
  const [reload, setReload] = useState(0);
  const [opening, setOpening] = useState(null);
  const [openError, setOpenError] = useState('');

  useEffect(() => {
    if (graphLoading) return undefined;
    let active = true;
    listStudentMaterials({ grade, subjectIds })
      .then(rows => { if (active) setState({ status: 'ready', rows }); })
      .catch(() => { if (active) setState({ status: 'error', rows: [] }); });
    return () => { active = false; };
  }, [graphLoading, grade, subjectIds, reload]);

  const chips = useMemo(() => [...new Map(state.rows.filter(r => r.subjects?.name).map(r => [r.subject_id, r.subjects.name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1])), [state.rows]);
  const shown = state.rows.filter(r => !subject || r.subject_id === subject);

  const openFile = async (row) => {
    setOpening(row.id);
    setOpenError('');
    const tab = window.open('about:blank', '_blank');
    try {
      const { data, error } = await supabase.storage.from(MATERIALS_BUCKET).createSignedUrl(row.file_path, 300);
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
          <p className="x-sub">Files and links from your teachers{grade ? ` for ${grade}` : ''}</p>
        </div>
        <div className="x-act">
          <button type="button" className="x-iconbtn" onClick={() => { setState({ status: 'loading', rows: [] }); setReload(k => k + 1); }} aria-label="Refresh learning materials">
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      {openError && <p role="alert" className="x-cs">{openError}</p>}
      {chips.length > 1 && (
        <div className="x-tlm-chips" role="group" aria-label="Filter by subject">
          <button type="button" className={`x-chip${subject ? '' : ' on'}`} aria-pressed={!subject} onClick={() => setSubject('')}>All subjects</button>
          {chips.map(([id, name]) => (
            <button key={id} type="button" className={`x-chip${subject === id ? ' on' : ''}`} aria-pressed={subject === id} onClick={() => setSubject(id)}>{name}</button>
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
      ) : shown.length === 0 ? (
        <div className="x-card x-pad x-tlm-none">
          <b>No learning materials yet.</b>
          <span className="x-cs">When your teachers add files or links for your subjects, they will show here.</span>
        </div>
      ) : (
        <ul className="x-tlm-grid" aria-label="Learning materials">
          {shown.map(row => {
            const link = row.kind === 'link' ? safeLink(row.link_url) : null;
            return (
              <li key={row.id} className="x-card x-pad">
                <span className="x-ico" aria-hidden="true">{row.kind === 'link' ? <ExternalLink size={16} /> : <FileText size={16} />}</span>
                <h2 className="x-ct">{row.title}</h2>
                <p className="x-cs">{[row.subjects?.name, row.grade_level].filter(Boolean).join(' · ')}</p>
                {row.description && <p className="x-cs">{row.description}</p>}
                {link ? (
                  <a className="x-btn" href={link} target="_blank" rel="noopener noreferrer" aria-label={`Open ${row.title} (opens in a new tab)`}>Open link</a>
                ) : row.file_path ? (
                  <button type="button" className="x-btn" onClick={() => openFile(row)} disabled={opening === row.id}
                    aria-label={`Open ${row.title} (opens in a new tab)`}>{opening === row.id ? 'Opening…' : 'Open file'}</button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
