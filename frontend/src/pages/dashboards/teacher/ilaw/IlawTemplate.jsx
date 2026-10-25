import IlawHybridHeader from './IlawHybridHeader';
import { createBlankIlawDocument, WEEKDAYS } from './ilawTemplateModel';
import { ILAW_SECTION_INTROS } from './ilawDocumentContent';
import './IlawTemplate.css';

const PLACEHOLDERS = {
  'Name of Lesson': 'Enter lesson title',
  'Teaching Date': 'Enter teaching date',
  'Learning Area/s': 'Enter subject',
  'Designed for which Grade Level and Section': 'Enter grade and section',
  'No. of Sessions': 'Enter number of sessions',
  'Class Duration (minutes per session)': 'e.g. 45 minutes',
  'Teaching Strategy': 'Describe the teaching strategy',
  'Learning Objectives (lesson-wide)': 'Write one objective per line',
};

function DocumentValue({ label, value, onChange, editable, multiline = false, fieldKey, error }) {
  if (!editable) return <span className="ilaw-template-value">{value || '\u00a0'}</span>;
  const inputProps = {
    'aria-label': label,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `ilaw-error-${fieldKey}` : undefined,
    'data-ilaw-field': fieldKey,
    placeholder: PLACEHOLDERS[label],
    value,
    onChange: event => onChange(event.target.value),
    className: 'ilaw-template-input',
  };
  if (multiline) {
    return <><textarea {...inputProps} rows={2} className="ilaw-template-input ilaw-template-textarea" />
      {error && <span id={`ilaw-error-${fieldKey}`} className="ilaw-template-field-error">{error}</span>}</>;
  }
  return <><input {...inputProps} />
    {error && <span id={`ilaw-error-${fieldKey}`} className="ilaw-template-field-error">{error}</span>}</>;
}

function SectionIntro({ title, description }) {
  return <tr className="ilaw-template-section-intro">
    <th scope="row">{title}</th>
    <td colSpan={5}>{description}</td>
  </tr>;
}

function WeekColumns() {
  return <colgroup><col /><col span={5} /></colgroup>;
}

// The same data-to-document mapping renders the editor and its read-only preview.
// It intentionally does not parse Gemini HTML or persist a Lesson Plan.
export default function IlawTemplate({ value, onChange, editable = true, sourceDetails, sourceDetailsTitle = 'Quick Create lesson details', onSourceDetailsChange, fieldErrors = {} }) {
  const document = value ?? createBlankIlawDocument();
  const canEdit = editable && typeof onChange === 'function';

  const changeInfo = (key, next) => onChange({ ...document, info: { ...document.info, [key]: next } });
  const changeWeekly = (key, day, next) => onChange({
    ...document,
    weekly: { ...document.weekly, [key]: { ...document.weekly[key], [day]: next } },
  });
  const changeSignature = (key, field, next) => onChange({
    ...document,
    signatures: { ...document.signatures, [key]: { ...document.signatures[key], [field]: next } },
  });

  const infoRow = (firstLabel, firstKey, secondLabel, secondKey) => <tr>
    <th scope="row">{firstLabel}</th>
    <td><DocumentValue label={firstLabel} value={document.info[firstKey]} editable={canEdit} onChange={next => changeInfo(firstKey, next)} fieldKey={firstKey} error={fieldErrors[firstKey]} /></td>
    <th scope="row">{secondLabel}</th>
    <td><DocumentValue label={secondLabel} value={document.info[secondKey]} editable={canEdit} onChange={next => changeInfo(secondKey, next)} fieldKey={secondKey} error={fieldErrors[secondKey]} /></td>
  </tr>;

  const wideInfoRow = (label, key) => <tr>
    <th scope="row">{label}</th>
    <td colSpan={3}><DocumentValue label={label} value={document.info[key]} editable={canEdit} onChange={next => changeInfo(key, next)} multiline={key === 'references' || key === 'aiUseDeclaration'} fieldKey={key} error={fieldErrors[key]} /></td>
  </tr>;

  const weeklyCells = (key, label) => WEEKDAYS.map(day => <td key={day} data-day={day} aria-label={`${label}, ${day}`}>
    <DocumentValue label={`${label}, ${day}`} value={document.weekly[key][day]} editable={canEdit} onChange={next => changeWeekly(key, day, next)} fieldKey={`${key}.${day}`} multiline />
  </td>);

  const weeklyRow = (key, label) => <tr key={key}>
    <th scope="row">{label}</th>{weeklyCells(key, label)}
  </tr>;

  const signature = (key, label) => <div className="ilaw-template-signature" key={key}>
    <h3>{label}</h3>
    {canEdit ? <>
      <label className="ilaw-template-signature-field"><span>Name</span>
        <DocumentValue label={`${label} name`} value={document.signatures[key].name} editable onChange={next => changeSignature(key, 'name', next)} />
      </label>
      <label className="ilaw-template-signature-field"><span>Designation</span>
        <DocumentValue label={`${label} designation`} value={document.signatures[key].role} editable onChange={next => changeSignature(key, 'role', next)} />
      </label>
    </> : <>
      <DocumentValue label={`${label} name`} value={document.signatures[key].name} editable={false} />
      <DocumentValue label={`${label} designation`} value={document.signatures[key].role} editable={false} />
    </>}
  </div>;

  return <article className="ilaw-template" aria-label="ILAW lesson plan document">
    <IlawHybridHeader />

    <h2 className="ilaw-template-title">ILAW LESSON PLAN{document.info.learningArea ? ` IN ${document.info.learningArea}` : ''}</h2>
    <p className="ilaw-template-scroll-hint">Swipe each table sideways to see every weekday.</p>

    <div className="ilaw-template-scroll" role="region" aria-label="Lesson information table" tabIndex={0}>
      <table className="ilaw-template-info"><tbody>
        {infoRow('Name of Lesson', 'nameOfLesson', 'Teaching Date', 'teachingDate')}
        {infoRow('Learning Area/s', 'learningArea', 'Term No. and Week No.', 'termWeek')}
        {wideInfoRow('Designed by Teacher/s', 'designedBy')}
        {wideInfoRow('Designed for which Grade Level and Section', 'gradeSection')}
        {wideInfoRow('No. of Sessions', 'sessions')}
        {wideInfoRow('References (books, websites, toolkits, etc.)', 'references')}
        {wideInfoRow('Declaration of AI Use', 'aiUseDeclaration')}
      </tbody></table>
    </div>

    {sourceDetails && <section className="ilaw-template-source" aria-label="Quick Create source details">
      <h3>{sourceDetailsTitle}</h3>
      <p>These lesson-wide details have not been assigned to a weekday. Complete the weekday cells below as needed.</p>
      {[
        ['classDuration', 'Class Duration (minutes per session)', false],
        ['teachingStrategy', 'Teaching Strategy', false],
        ['learningObjectives', 'Learning Objectives (lesson-wide)', true],
      ].map(([key, label, multiline]) => <label key={key}>{label}
        <DocumentValue label={label} value={sourceDetails[key]} editable={canEdit && typeof onSourceDetailsChange === 'function'}
          multiline={multiline} fieldKey={key} error={key === 'learningObjectives' ? fieldErrors.objectives : undefined}
          onChange={next => onSourceDetailsChange({ ...sourceDetails, [key]: next })} />
      </label>)}
    </section>}

    <div id="ilaw-intentions" className="ilaw-template-scroll" role="region" aria-label="Intentions table" tabIndex={0}>
      {fieldErrors.objectives && !sourceDetails && <p className="ilaw-template-field-error">{fieldErrors.objectives}</p>}
      <table className="ilaw-template-week ilaw-template-intentions"><WeekColumns /><tbody>
        <SectionIntro title="I — INTENTIONS" description={ILAW_SECTION_INTROS.intentions} />
        <tr><th scope="row">Learning Competency</th><td colSpan={5}>
          <DocumentValue label="Learning Competency" value={document.learningCompetency} editable={canEdit}
            onChange={next => onChange({ ...document, learningCompetency: next })} multiline />
        </td></tr>
        <tr><th scope="row" rowSpan={2}>Learning Objectives</th>{WEEKDAYS.map(day => <th scope="col" key={day}>{day}</th>)}</tr>
        <tr>{weeklyCells('learningObjectives', 'Learning Objectives')}</tr>
        {weeklyRow('learnerContext', 'Learner Context')}
      </tbody></table>
    </div>

    <div id="ilaw-experience" className="ilaw-template-scroll" role="region" aria-label="Learning Experience table" tabIndex={0}>
      {fieldErrors.activities && <p className="ilaw-template-field-error">{fieldErrors.activities}</p>}
      <table className="ilaw-template-week"><WeekColumns /><tbody>
        <SectionIntro title="L — LEARNING EXPERIENCE" description={ILAW_SECTION_INTROS.experience} />
        {weeklyRow('preLesson', 'Pre-Lesson')}
        {weeklyRow('flow', 'Flow')}
        {weeklyRow('learningResources', 'Learning Resources')}
        {weeklyRow('integration', 'Opportunities for Integration')}
      </tbody></table>
    </div>

    <div id="ilaw-assessment" className="ilaw-template-scroll" role="region" aria-label="Assessment table" tabIndex={0}>
      {fieldErrors.assessment && <p className="ilaw-template-field-error">{fieldErrors.assessment}</p>}
      <table className="ilaw-template-week"><WeekColumns /><tbody>
        <SectionIntro title="A — ASSESSMENT" description={ILAW_SECTION_INTROS.assessment} />
        {weeklyRow('formativeAssessment', 'Formative Assessment')}
      </tbody></table>
    </div>

    <div id="ilaw-ways-forward" className="ilaw-template-scroll" role="region" aria-label="Ways Forward table" tabIndex={0}>
      <table className="ilaw-template-week"><WeekColumns /><tbody>
        <SectionIntro title="W — WAYS FORWARD" description={ILAW_SECTION_INTROS.waysForward} />
        {weeklyRow('extendedLearning', 'Extended Learning Opportunities')}
        {weeklyRow('reflections', 'Reflections')}
      </tbody></table>
    </div>

    <section className="ilaw-template-signatures" aria-label="Lesson plan signatures">
      {signature('preparedBy', 'Prepared by')}
      {signature('checkedBy', 'Checked by')}
      {signature('notedBy', 'Noted by')}
    </section>
  </article>;
}
