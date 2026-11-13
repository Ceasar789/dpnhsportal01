// ============================================
// FILE: src/components/clarity/teacher/ClarityTeacherMaterialsTab.jsx
// Learning Materials (M2): the teacher's own files and links, Clarity only
// (no classic route). Option A card grid: search, subject chips, a type
// filter, and cards with a type badge, title, subject · grade, description,
// size or host · date, Open and Edit. Real data only: the teacher's
// public.learning_materials rows and their own teacher_subjects pairs.
// Rules live in materials/materialRules.js, reads and writes in
// materials/materialsApi.js.
// ============================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileText, Image as ImageIcon, Link2, Pencil, Plus, Search } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../pages/dashboards/teacher/hooks';
import { Toast } from '../../../pages/dashboards/teacher/shared/ui';
import useQuickCreateAssignments from '../../../pages/dashboards/teacher/lessonPlans/useQuickCreateAssignments';
import MaterialFormModal from './materials/MaterialFormModal';
import {
  filterMaterials, metaLine, safeLink, subjectChips, subjectGradeLine, subjectOptions, typeLabel, typeOptions,
} from './materials/materialRules';
import { listMaterials, loadOfficialSchoolYear, openInNewTab, signedMaterialUrl } from './materials/materialsApi';
import { Skeleton, SkeletonGroup } from '../../ui/Skeleton';

const TypeIcon = ({ row }) => {
  if (row.kind === 'link') return <Link2 size={14} aria-hidden="true" />;
  if (typeLabel(row) === 'Image') return <ImageIcon size={14} aria-hidden="true" />;
  return <FileText size={14} aria-hidden="true" />;
};

// L2: the card grid while it loads: the same grid and cards, bars for the words.
const GRID_SKELETON = (
  <SkeletonGroup as="ul" className="x-tlm-grid">
    {[0, 1, 2, 3, 4, 5].map(i => (
      <li key={i} className="x-card x-tlm-card">
        <span><Skeleton inline h={22} w={72} className="sk-round" /></span>
        <p className="x-tlm-title"><Skeleton inline h="0.8em" w="70%" /></p>
        <p className="x-tlm-sg"><Skeleton inline h="0.8em" w="45%" /></p>
        <p className="x-cs x-tlm-meta"><Skeleton inline h="0.8em" w="55%" /></p>
        <div className="x-tlm-act"><span className="x-btn"><Skeleton inline h="0.8em" w={40} /></span><span className="x-btn gh"><Skeleton inline h="0.8em" w={40} /></span></div>
      </li>
    ))}
  </SkeletonGroup>
);

const ClarityTeacherMaterialsTab = () => {
  const { userData } = useAuth();
  const teacherId = userData?.uid || null;
  const { toast, showToast } = useToast();

  const [materials, setMaterials] = useState({ status: 'loading', rows: [] });
  const [reloadKey, setReloadKey] = useState(0);
  const [year, setYear] = useState({ status: 'loading', value: null });
  const [yearKey, setYearKey] = useState(0);
  const assignments = useQuickCreateAssignments(teacherId, year.value);

  const [query, setQuery] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [type, setType] = useState('');
  const [dialog, setDialog] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const addRef = useRef(null);
  const focusAddRef = useRef(false);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(async () => {
      if (!active) return;
      if (!teacherId) { setMaterials({ status: 'error', rows: [] }); return; }
      setMaterials(current => ({ status: 'loading', rows: current.rows }));
      try {
        const rows = await listMaterials(teacherId);
        if (active) setMaterials({ status: 'ready', rows });
      } catch {
        if (active) setMaterials({ status: 'error', rows: [] });
      }
    });
    return () => { active = false; };
  }, [teacherId, reloadKey]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(async () => {
      if (!active) return;
      setYear({ status: 'loading', value: null });
      const value = await loadOfficialSchoolYear();
      if (active) setYear({ status: value ? 'ready' : 'error', value });
    });
    return () => { active = false; };
  }, [yearKey]);

  const subjects = useMemo(() => subjectOptions(assignments.assignmentRows), [assignments.assignmentRows]);
  const subjectsState = year.status === 'loading' ? 'loading'
    : year.status === 'error' ? 'error'
      : assignments.loadState === 'ready' ? 'ready' : assignments.loadState === 'error' ? 'error' : 'loading';
  const retrySubjects = useCallback(() => {
    if (year.status === 'error') setYearKey(k => k + 1); else assignments.retry();
  }, [year.status, assignments]);

  const rows = materials.rows;
  const chips = useMemo(() => subjectChips(rows), [rows]);
  const types = useMemo(() => typeOptions(rows), [rows]);
  // A filter whose option no longer exists (after a delete) counts as "all".
  const activeSubject = chips.some(c => c.id === subjectId) ? subjectId : '';
  const activeType = types.includes(type) ? type : '';
  const shown = useMemo(() => filterMaterials(rows, { query, subjectId: activeSubject, type: activeType }),
    [rows, query, activeSubject, activeType]);
  const filtering = Boolean(query.trim() || activeSubject || activeType);

  const openFile = async (row) => {
    if (openingId) return;
    setOpeningId(row.id);
    const url = await signedMaterialUrl(row);
    setOpeningId(null);
    if (!url || !openInNewTab(url)) showToast('The file could not be opened. Try again.', 'error');
  };

  const onSaved = (saved, editing) => {
    setMaterials(current => ({
      ...current,
      rows: editing ? current.rows.map(r => (r.id === saved.id ? saved : r)) : [saved, ...current.rows],
    }));
    setDialog(null);
    showToast(editing ? 'Changes saved.' : 'Material added.');
  };

  const onDeleted = (removed, orphan) => {
    setMaterials(current => ({ ...current, rows: current.rows.filter(r => r.id !== removed.id) }));
    setDialog(null);
    showToast(orphan ? 'Material deleted. Its file could not be removed automatically.' : 'Material deleted.', orphan ? 'error' : 'success');
    // The card that opened the dialog is gone; focus "Add material" once the dialogs are closed.
    focusAddRef.current = true;
  };

  useEffect(() => {
    if (dialog || !focusAddRef.current) return;
    focusAddRef.current = false;
    addRef.current?.focus();
  }, [dialog]);

  const clearFilters = () => { setQuery(''); setSubjectId(''); setType(''); };

  return (
    <div className="x-tlm">
      <div className="x-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="x-h1">Learning Materials</h1>
          <p className="x-sub">Your own files and links for teaching</p>
        </div>
        <div className="x-act">
          <button ref={addRef} type="button" className="x-btn pri" onClick={() => setDialog({ mode: 'add' })}>
            <Plus size={16} aria-hidden="true" /> Add material
          </button>
        </div>
      </div>

      {materials.status === 'ready' && rows.length > 0 && (
        <>
          <div className="x-tlm-tools">
            <label className="x-search x-tlm-search">
              <Search size={16} aria-hidden="true" />
              <span className="x-sr">Search learning materials</span>
              <input type="search" placeholder="Search materials..." value={query} onChange={e => setQuery(e.target.value)} />
            </label>
            {types.length > 1 && (
              <label className="x-tlm-type">
                <span className="x-sr">Filter by type</span>
                <select className="x-select" value={activeType} onChange={e => setType(e.target.value)}>
                  <option value="">All types</option>
                  {types.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            )}
          </div>
          {chips.length > 0 && (
            <div className="x-tlm-chips" role="group" aria-label="Filter by subject">
              <button type="button" className={`x-chip${activeSubject ? '' : ' on'}`} aria-pressed={!activeSubject}
                onClick={() => setSubjectId('')}>All subjects</button>
              {chips.map(c => (
                <button key={c.id} type="button" className={`x-chip${activeSubject === c.id ? ' on' : ''}`}
                  aria-pressed={activeSubject === c.id} onClick={() => setSubjectId(c.id)}>{c.name}</button>
              ))}
            </div>
          )}
        </>
      )}

      {materials.status === 'loading' && rows.length === 0 ? (
        <>
          <p className="x-sr" role="status">Loading learning materials…</p>
          <SkeletonGroup className="x-tlm-tools"><span className="x-search x-tlm-search"><Skeleton inline h="0.8em" w="40%" /></span></SkeletonGroup>
          {GRID_SKELETON}
        </>
      ) : materials.status === 'error' ? (
        <div className="x-card x-pad x-rail">
          <span role="alert">Learning materials could not be loaded. Check your connection and try again.</span>
          <button type="button" className="x-btn" onClick={() => setReloadKey(k => k + 1)}>Retry</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="x-card x-pad x-tlm-none">
          <b>No learning materials yet.</b>
          <span className="x-cs">Add a file or a link to keep your teaching materials in one place.</span>
        </div>
      ) : shown.length === 0 ? (
        <div className="x-card x-pad x-tlm-none">
          <b>No materials match your search or filters.</b>
          {filtering && <button type="button" className="x-btn x-tlm-clear" onClick={clearFilters}>Clear filters</button>}
        </div>
      ) : (
        <ul className="x-tlm-grid" aria-label="Learning materials">
          {shown.map((row) => {
            const sg = subjectGradeLine(row);
            const meta = metaLine(row);
            const link = row.kind === 'link' ? safeLink(row.link_url) : null;
            return (
              <li key={row.id} className="x-card x-tlm-card">
                <span className={`x-badge x-tlm-badge${row.kind === 'link' ? ' link' : ''}`}><TypeIcon row={row} />{typeLabel(row)}</span>
                <h2 className="x-tlm-title">{row.title}</h2>
                {sg && <p className="x-tlm-sg">{sg}</p>}
                {row.description && <p className="x-tlm-desc">{row.description}</p>}
                {meta && <p className="x-cs x-tlm-meta">{meta}</p>}
                <div className="x-tlm-act">
                  {row.kind === 'link' ? (
                    link && (
                      <a className="x-btn" href={link} target="_blank" rel="noopener noreferrer" aria-label={`Open ${row.title} (opens in a new tab)`}>
                        <ExternalLink size={16} aria-hidden="true" /> Open
                      </a>
                    )
                  ) : (
                    <button type="button" className="x-btn" onClick={() => openFile(row)} disabled={Boolean(openingId)}
                      aria-busy={openingId === row.id ? 'true' : undefined} aria-label={`Open ${row.title} (opens in a new tab)`}>
                      <ExternalLink size={16} aria-hidden="true" /> {openingId === row.id ? 'Opening…' : 'Open'}
                    </button>
                  )}
                  <button type="button" className="x-btn gh" onClick={() => setDialog({ mode: 'edit', row })} aria-label={`Edit ${row.title}`}>
                    <Pencil size={16} aria-hidden="true" /> Edit
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {dialog && (
        <MaterialFormModal
          key={dialog.row?.id || 'add'}
          mode={dialog.mode}
          row={dialog.row || null}
          teacherId={teacherId}
          subjects={subjects}
          subjectsState={subjectsState}
          onRetrySubjects={retrySubjects}
          onSaved={onSaved}
          onDeleted={onDeleted}
          onClose={() => setDialog(null)}
        />
      )}
      <Toast toast={toast} />
    </div>
  );
};

export default ClarityTeacherMaterialsTab;
