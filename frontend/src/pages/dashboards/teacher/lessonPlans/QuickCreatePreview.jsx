import { useState } from 'react';
import { currentSchoolYear } from '../../../../lib/academicRules';
import QuickCreateForm from './QuickCreateForm';
import './QuickCreatePreview.css';

const schoolYear = currentSchoolYear();
const fixtures = {
  multi: { teacherId: 'synthetic-teacher-multi', label: 'Multiple assignments', rows: [
    { subject_id: 'synthetic-math', grade_level: 'Grade 7', subjects: { id: 'synthetic-math', name: 'Mathematics' } },
    { subject_id: 'synthetic-math', grade_level: 'Grade 8', subjects: { id: 'synthetic-math', name: 'Mathematics' } },
    { subject_id: 'synthetic-english', grade_level: 'Grade 7', subjects: { id: 'synthetic-english', name: 'English' } },
  ] },
  single: { teacherId: 'synthetic-teacher-single', label: 'One assignment', rows: [
    { subject_id: 'synthetic-science', grade_level: 'Grade 9', subjects: { id: 'synthetic-science', name: 'Science' } },
  ] },
  adviser: { teacherId: 'synthetic-teacher-adviser', label: 'Adviser only, no teaching load', rows: [], adviserSection: 'Sample Grade 8 section' },
};

export default function QuickCreatePreview() {
  const [scenario, setScenario] = useState('multi');
  const [loadState, setLoadState] = useState('ready');
  const [mockFailure, setMockFailure] = useState(false);
  const [lastPayload, setLastPayload] = useState(null);
  const fixture = fixtures[scenario];

  const changeScenario = next => {
    setScenario(next);
    setLoadState('ready');
    setLastPayload(null);
  };

  return <main className="qc-preview-page">
    <header className="qc-preview-header">
      <h1>Quick Create — isolated local QA</h1>
      <p>Fictional Teacher assignments only. No authentication, backend, Supabase, Storage, or production Save.</p>
      <div className="qc-preview-controls">
        <label>Fixture scenario
          <select value={scenario} onChange={event => changeScenario(event.target.value)}>
            {Object.entries(fixtures).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => setLoadState('loading')}>Simulate loading</button>
        <button type="button" onClick={() => setLoadState('error')}>Simulate fetch error</button>
        <button type="button" onClick={() => setLoadState('ready')}>Show fixture assignments</button>
        <label className="qc-preview-check"><input type="checkbox" checked={mockFailure} onChange={event => setMockFailure(event.target.checked)} /> Simulate mock-create failure</label>
      </div>
      <p>Current school year: {schoolYear}. {fixture.adviserSection ? `Adviser of ${fixture.adviserSection}; no subject authorization.` : 'Subject/grade rows imitate the teaching-load query.'}</p>
    </header>
    <QuickCreateForm teacherId={fixture.teacherId} schoolYear={schoolYear}
      assignmentRows={loadState === 'ready' ? fixture.rows : []} sourceTeacherId={fixture.teacherId}
      sourceSchoolYear={schoolYear} loadState={loadState} onRetry={() => setLoadState('ready')}
      onMockCreate={async payload => {
        if (mockFailure) throw new Error('Synthetic failure');
        setLastPayload(payload);
      }} />
    <section aria-label="Proposed mock payload" className="qc-preview-payload">
      <h2>Last proposed payload (mock only)</h2>
      <pre>{lastPayload ? JSON.stringify(lastPayload, null, 2) : 'No mock create completed.'}</pre>
      <p>subject_id and grade_level persistence require deployed-column verification. Real Save requires trusted Teacher, assignment, and school-year checks.</p>
    </section>
  </main>;
}
