import { useState } from 'react';
import IlawTemplate from './IlawTemplate';
import FullManualIlawEditor from './FullManualIlawEditor';
import MockManualPersistence from '../../../../../ilaw-preview/MockManualPersistence';
import { createBlankIlawDocument, WEEKDAYS } from './ilawTemplateModel';
import './IlawPreviewApp.css';

const manualFixtures = [
  { teacherId: 'synthetic-teacher-a', teacherLabel: 'Alex Example', planId: 'synthetic-plan-a', planLabel: 'Mathematics draft',
    assignment: { subjectId: 'synthetic-math', subjectName: 'Mathematics', gradeLevel: 'Grade 8' } },
  { teacherId: 'synthetic-teacher-b', teacherLabel: 'Sam Example', planId: 'synthetic-plan-b', planLabel: 'Science draft',
    assignment: { subjectId: 'synthetic-science', subjectName: 'Science', gradeLevel: 'Grade 7' } },
];

const sample = () => {
  const document = createBlankIlawDocument({ subject: 'Mathematics', grade: 'Grade 8, Section Sample' });
  document.info.nameOfLesson = 'Equivalent Fractions';
  document.info.teachingDate = 'Sample teaching week';
  document.info.termWeek = 'Term 1, Week 2';
  document.info.designedBy = 'Alex Example (fictional teacher)';
  document.info.sessions = '5 sessions';
  document.info.references = 'Synthetic classroom materials for visual QA only.';
  document.info.aiUseDeclaration = 'No AI was used to prepare this synthetic example.';
  document.learningCompetency = 'Describe equivalent fractions using visual models.';

  const examples = {
    learningObjectives: 'Represent equivalent fractions',
    learnerContext: 'Use familiar fraction diagrams',
    preLesson: 'Review equal parts of a whole',
    flow: 'Compare fraction models in pairs',
    learningResources: 'Paper fraction strips',
    integration: 'Connect fractions to measurement',
    formativeAssessment: 'Explain one equivalent pair',
    extendedLearning: 'Find fractions in a recipe',
    reflections: 'Note which models helped learners',
  };
  Object.entries(examples).forEach(([field, text]) => {
    WEEKDAYS.forEach(day => { document.weekly[field][day] = `${text} — ${day}.`; });
  });
  // Signature names and positions intentionally remain blank.
  return document;
};

export default function IlawPreviewApp() {
  const [blankDraft, setBlankDraft] = useState(() => createBlankIlawDocument());
  const [sampleDraft, setSampleDraft] = useState(sample);
  const [activeDraft, setActiveDraft] = useState('blank');
  const [mode, setMode] = useState('blank');
  const document = activeDraft === 'blank' ? blankDraft : sampleDraft;
  const setDocument = activeDraft === 'blank' ? setBlankDraft : setSampleDraft;

  const showEditor = next => { setActiveDraft(next); setMode(next); };

  return <main className="ilaw-preview-page">
    <header className="ilaw-preview-toolbar">
      <div>
        <h1>ILAW Template — Local QA Preview</h1>
        <p>Synthetic fixture only. No login, Save, API, or database connection.</p>
      </div>
      <div className="ilaw-preview-actions" aria-label="Preview modes">
        <button type="button" aria-pressed={mode === 'blank'} onClick={() => showEditor('blank')}>Blank editor</button>
        <button type="button" aria-pressed={mode === 'populated'} onClick={() => showEditor('populated')}>Populated example</button>
        <button type="button" aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>Read-only preview</button>
        <button type="button" aria-pressed={mode === 'manual'} onClick={() => setMode('manual')}>Full Manual ILAW</button>
        <button type="button" aria-pressed={mode === 'mock-save'} onClick={() => setMode('mock-save')}>Mock Draft and Save</button>
        {mode !== 'manual' && mode !== 'mock-save' && <button type="button" onClick={() => window.print()}>Browser print preview</button>}
      </div>
      <p className="ilaw-preview-mode" role="status">
        {mode === 'mock-save' ? 'Synthetic Manual ILAW persistence fixture; no production connection'
          : mode === 'manual' ? 'Isolated Full Manual ILAW authoring with synthetic assignments'
          : mode === 'preview' ? `Read-only preview of ${activeDraft === 'blank' ? 'your blank draft' : 'the populated example'}`
            : mode === 'blank' ? 'Editing blank draft' : 'Editing populated example'}
      </p>
    </header>
    <div hidden={mode !== 'manual'}><FullManualIlawEditor fixtures={manualFixtures} /></div>
    {mode === 'mock-save' && <MockManualPersistence />}
    {mode !== 'manual' && mode !== 'mock-save' && <IlawTemplate value={document} onChange={setDocument} editable={mode !== 'preview'} />}
  </main>;
}
