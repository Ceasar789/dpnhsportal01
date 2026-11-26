// ============================================
// FILE: src/components/clarity/teacher/ClarityTeacherMaterialsTab.jsx
// Learning Materials (M2): the teacher's own files and links, Clarity only
// (no classic route). U-PDF-T-FIX-B (design p20, the approved filter version):
// one row with search and the Grade, Section and Type filters, "N materials",
// then a table (Title, Class, Type, Posted; Open, Edit, Repost) that becomes
// stacked cards on phones, and the DepEd official resources below.
// A material is shared with CLASSES (learning_material_classes, owner-only
// RLS); none = Private (only me). Real classes = the teacher's sections from
// schedules and adviser, read as Distribute and postToClass.js read them.
// Rules live in materials/materialRules.js, reads and writes in
// materials/materialsApi.js.
// ============================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileText, Image as ImageIcon, Link2, Pencil, Plus, Repeat2, Search } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../pages/dashboards/teacher/hooks';
import { Toast } from '../../../pages/dashboards/teacher/shared/ui';
import MaterialFormModal, { SHARE_FAILED_NOTE } from './materials/MaterialFormModal';
import MaterialRepostModal from './materials/MaterialRepostModal';
import { DEPED_MODULES } from './materials/depedModules';
import { GRADE_LEVELS, isRetiredGradeLevel } from '../../../lib/academicRules';
import {
  PRIVATE_LABEL, PRIVATE_SECTION, classCell, classLabel, filterByClass, filterMaterials, postedDate, safeLink, sharesOf, typeLabel, typeOptions,
} from './materials/materialRules';
import { listMaterialClasses, listMaterials, loadTeacherSections, openInNewTab, signedMaterialUrl } from './materials/materialsApi';
import { supabase } from '../../../config/supabase';
import { Skeleton, SkeletonGroup } from '../../ui/Skeleton';

const TypeIcon = ({ row }) => {
  if (row.kind === 'link') return <Link2 size={16} aria-hidden="true" />;
  if (typeLabel(row) === 'Image') return <ImageIcon size={16} aria-hidden="true" />;
  return <FileText size={16} aria-hidden="true" />;
};

// L2: the table while it loads: the same frame, bars for the words.
const TABLE_SKELETON = (
  <SkeletonGroup className="x-card x-tlm-tablewrap">
    <ul className="x-tlm-skel">
      {[0, 1, 2, 3].map(i => (
        <li key={i}><Skeleton inline h="0.8em" w="45%" /><Skeleton inline h="0.8em" w="20%" /><Skeleton inline h="0.8em" w="12%" /></li>
      ))}
    </ul>
  </SkeletonGroup>
);

const ClarityTeacherMaterialsTab = () => {
  const { userData } = useAuth();
  const teacherId = userData?.uid || null;
  const { toast, showToast } = useToast();

  const [materials, setMaterials] = useState({ status: 'loading', rows: [] });
  const [reloadKey, setReloadKey] = useState(0);
  const [shares, setShares] = useState({ status: 'loading', rows: [] });
  const [sharesKey, setSharesKey] = useState(0);
  const [classes, setClasses] = useState({ status: 'loading', rows: [] });
  const [classesKey, setClassesKey] = useState(0);

  const [query, setQuery] = useState('');
  const [grade, setGrade] = useState('');
  const [sectionId, setSectionId] = useState('');
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
      if (!active || !teacherId) return;
      setShares(current => ({ status: 'loading', rows: current.rows }));
      try {
        const rows = await listMaterialClasses();
        if (active) setShares({ status: 'ready', rows });
      } catch {
        if (active) setShares({ status: 'error', rows: [] });
      }
    });
    return () => { active = false; };
  }, [teacherId, sharesKey]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(async () => {
      if (!active || !teacherId) return;
      setClasses({ status: 'loading', rows: [] });
      const rows = await Promise.resolve().then(() => loadTeacherSections(supabase, teacherId)).catch(() => null);
      // An old Grade 11/12 section is never offered (filters, Add, Repost).
      if (active) setClasses(Array.isArray(rows) ? { status: 'ready', rows: rows.filter(s => !isRetiredGradeLevel(s.grade_level)) } : { status: 'error', rows: [] });
    });
    return () => { active = false; };
  }, [teacherId, classesKey]);

  const rows = materials.rows;
  const types = useMemo(() => typeOptions(rows), [rows]);
  // A filter whose option no longer exists counts as "all".
  const activeGrade = GRADE_LEVELS.includes(grade) ? grade : '';
  const sectionChoices = classes.rows.filter(s => !activeGrade || s.grade_level === activeGrade);
  const activeSection = sectionId === PRIVATE_SECTION || sectionChoices.some(s => s.id === sectionId) ? sectionId : '';
  const activeType = types.includes(type) ? type : '';
  const listed = useMemo(() => filterByClass(filterMaterials(rows, { query, type: activeType }), shares.rows,
    { grade: activeGrade, sectionId: activeSection }), [rows, query, activeType, shares.rows, activeGrade, activeSection]);
  const filtering = Boolean(query.trim() || activeGrade || activeSection || activeType);
  const classesOf = row => sharesOf(shares.rows, row.id);

  const openFile = async (row) => {
    if (openingId) return;
    setOpeningId(row.id);
    const url = await signedMaterialUrl(row);
    setOpeningId(null);
    if (!url || !openInNewTab(url)) showToast('The file could not be opened. Try again.', 'error');
  };

  const onSaved = (saved, editing, { section = null, shareFailed = false } = {}) => {
    setMaterials(current => ({
      ...current,
      rows: editing ? current.rows.map(r => (r.id === saved.id ? saved : r)) : [saved, ...current.rows],
    }));
    setDialog(null);
    if (section && !shareFailed) setSharesKey(k => k + 1);
    if (shareFailed) showToast(SHARE_FAILED_NOTE, 'error');
    else showToast(editing ? 'Changes saved.' : section ? `Material added and shared with ${classLabel(section)}.` : 'Material added.');
  };

  const onPosted = (section) => {
    setDialog(null);
    // The first share of a material with no grade gives it the class's grade: read both again.
    setSharesKey(k => k + 1);
    setReloadKey(k => k + 1);
    showToast(`Posted to ${classLabel(section)}.`);
  };

  const onDeleted = (removed, orphan) => {
    setMaterials(current => ({ ...current, rows: current.rows.filter(r => r.id !== removed.id) }));
    setDialog(null);
    showToast(orphan ? 'Material deleted. Its file could not be removed automatically.' : 'Material deleted.', orphan ? 'error' : 'success');
    // The row that opened the dialog is gone; focus "Add material" once the dialogs are closed.
    focusAddRef.current = true;
  };

  useEffect(() => {
    if (dialog || !focusAddRef.current) return;
    focusAddRef.current = false;
    addRef.current?.focus();
  }, [dialog]);

  const clearFilters = () => { setQuery(''); setGrade(''); setSectionId(''); setType(''); };
  const canRepost = classes.status === 'ready' && shares.status === 'ready';

  return (
    <div className="x-tlm">
      <div className="x-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="x-h1">Learning Materials</h1>
          <p className="x-sub">Your own files and links for teaching.</p>
        </div>
        <div className="x-act">
          <button ref={addRef} type="button" className="x-btn pri" onClick={() => setDialog({ mode: 'add' })}>
            <Plus size={16} aria-hidden="true" /> Add material
          </button>
        </div>
      </div>

      {materials.status !== 'error' && rows.length > 0 && (
        <>
          <div className="x-tlm-tools x-tlm-filters">
            <label className="x-search x-tlm-search">
              <Search size={16} aria-hidden="true" />
              <span className="x-sr">Search learning materials</span>
              <input type="search" placeholder="Search materials..." value={query} onChange={e => setQuery(e.target.value)} />
            </label>
            <label className="x-tlm-filter">
              <span className="x-sr">Filter by grade</span>
              <select className="x-select" value={activeGrade} onChange={e => setGrade(e.target.value)}>
                <option value="">All grades</option>
                {GRADE_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
              </select>
            </label>
            <label className="x-tlm-filter">
              <span className="x-sr">Filter by section</span>
              <select className="x-select" value={activeSection} onChange={e => setSectionId(e.target.value)}>
                <option value="">All sections</option>
                {sectionChoices.map(s => <option key={s.id} value={s.id}>{classLabel(s)}</option>)}
                <option value={PRIVATE_SECTION}>{PRIVATE_LABEL}</option>
              </select>
            </label>
            <label className="x-tlm-filter">
              <span className="x-sr">Filter by type</span>
              <select className="x-select" value={activeType} onChange={e => setType(e.target.value)}>
                <option value="">All types</option>
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
          <p className="x-cs x-tlm-total">{listed.length} {listed.length === 1 ? 'material' : 'materials'}</p>
          {(shares.status === 'error' || classes.status === 'error') && (
            <div className="x-card x-pad x-rail x-tlm-classerr">
              <span role="alert">Your classes could not be loaded, so the Class column and Repost are not available. Try again.</span>
              <button type="button" className="x-btn" onClick={() => {
                if (shares.status === 'error') setSharesKey(k => k + 1);
                if (classes.status === 'error') setClassesKey(k => k + 1);
              }}>Retry</button>
            </div>
          )}
        </>
      )}

      {materials.status === 'loading' && rows.length === 0 ? (
        <>
          <p className="x-sr" role="status">Loading learning materials…</p>
          <SkeletonGroup className="x-tlm-tools"><span className="x-search x-tlm-search"><Skeleton inline h="0.8em" w="40%" /></span></SkeletonGroup>
          {TABLE_SKELETON}
        </>
      ) : materials.status === 'error' ? (
        <div className="x-card x-pad x-rail">
          <span role="alert">Learning materials could not be loaded. Check your connection and try again.</span>
          <button type="button" className="x-btn" onClick={() => setReloadKey(k => k + 1)}>Retry</button>
        </div>
      ) : rows.length === 0 ? (
        // U-T4: about the teacher's OWN materials only. The DepEd resources
        // below are official links, so the page never says there is nothing.
        <div className="x-card x-pad x-tlm-none">
          <b>You have not added your own materials yet.</b>
          <span className="x-cs">Add a file or a link to keep your teaching materials in one place. The DepEd resources below are official links, not your uploads.</span>
        </div>
      ) : listed.length === 0 ? (
        <div className="x-card x-pad x-tlm-none">
          <b>No materials match your search or filters.</b>
          {filtering && <button type="button" className="x-btn x-tlm-clear" onClick={clearFilters}>Clear filters</button>}
        </div>
      ) : (
        <div className="x-card x-tlm-tablewrap">
          <table className="x-tlm-table" aria-label="Learning materials">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Class</th>
                <th scope="col">Type</th>
                <th scope="col">Posted</th>
                <th scope="col"><span className="x-sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {listed.map((row) => {
                const link = row.kind === 'link' ? safeLink(row.link_url) : null;
                return (
                  <tr key={row.id}>
                    <th scope="row" className="x-tlm-tcell">
                      <span className="x-tlm-ticon" aria-hidden="true"><TypeIcon row={row} /></span>
                      <span className="x-tlm-tname">{row.title}</span>
                    </th>
                    <td data-label="Class" className="x-tlm-class">{shares.status === 'ready' ? classCell(classesOf(row)) : '—'}</td>
                    <td data-label="Type">{typeLabel(row)}</td>
                    <td data-label="Posted">{postedDate(row.created_at)}</td>
                    <td className="x-tlm-rowact"><div className="x-tlm-acts">
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
                      <button type="button" className="x-btn gh" disabled={!canRepost} onClick={() => setDialog({ mode: 'repost', row })}
                        aria-label={`Repost ${row.title}`}>
                        <Repeat2 size={16} aria-hidden="true" /> Repost
                      </button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* R52 (4c): DepEd learning resources per grade, teachers only (Q17). */}
      <section className="x-card x-pad" aria-labelledby="x-tlm-deped" style={{ marginTop: 16 }}>
        <h2 className="x-ct" id="x-tlm-deped">DepEd official resources</h2>
        <p className="x-cs">Budget of work and modules per grade from the DepEd LR portal. Opens the official site in a new tab.</p>
        <ul className="x-tlm-grid" aria-label="DepEd learning resources by grade" style={{ marginTop: 12 }}>
          {DEPED_MODULES.map(module => (
            <li key={module.grade} className="x-card x-pad">
              <h3 className="x-ct">{module.grade}</h3>
              <a className="x-btn" href={module.url} target="_blank" rel="noopener noreferrer"
                aria-label={`Open the ${module.grade} budget of work on the DepEd LR portal (opens in a new tab)`}>
                Open {module.grade} on the DepEd LR portal
              </a>
              <details style={{ marginTop: 8 }}>
                <summary className="x-btn gh">{module.subjects.length} subjects</summary>
                <ul className="x-tlm-chips" aria-label={`${module.grade} subjects`}>
                  {module.subjects.map(name => <li key={name} className="x-badge">{name}</li>)}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      </section>

      {dialog && dialog.mode !== 'repost' && (
        <MaterialFormModal
          key={dialog.row?.id || 'add'}
          mode={dialog.mode}
          row={dialog.row || null}
          teacherId={teacherId}
          classes={classes.rows}
          classesState={classes.status}
          onRetryClasses={() => setClassesKey(k => k + 1)}
          sharedWith={dialog.row ? classesOf(dialog.row) : []}
          onSaved={onSaved}
          onDeleted={onDeleted}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.mode === 'repost' && (
        <MaterialRepostModal
          key={dialog.row.id}
          row={dialog.row}
          classes={classes.rows}
          posted={classesOf(dialog.row)}
          onPosted={onPosted}
          onClose={() => setDialog(null)}
        />
      )}
      <Toast toast={toast} />
    </div>
  );
};

export default ClarityTeacherMaterialsTab;
