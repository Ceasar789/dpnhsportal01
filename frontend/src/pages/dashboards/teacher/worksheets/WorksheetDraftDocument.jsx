import { Fragment } from 'react';
import IlawHybridHeader from '../ilaw/IlawHybridHeader';
import { parseActivityText } from './activityTextBlocks';
import { studentDraftPreview } from './generatedDraftModel';
import './WorksheetDraftDocument.css';

const answerText = (answer, itemType) => Array.isArray(answer) ? answer.join(', ')
  : answer || (itemType === 'essay' ? 'Teacher-scored' : 'Not set');

// Text nodes only: saved instructions come from the AI and are never HTML.
function ActivityBody({ text }) {
  return <div className="activity-body">{parseActivityText(text).map((block, index) => {
    if (block.type === 'fields') return <dl key={index} className="activity-fields">{block.rows.map(([label, value], row) =>
      <Fragment key={row}><dt>{label}</dt><dd>{value}</dd></Fragment>)}</dl>;
    if (block.type === 'heading') return <h4 key={index} className="activity-heading">{block.text}</h4>;
    if (block.type === 'p') return <p key={index} className="activity-para">{block.text}</p>;
    const List = block.type;
    return <List key={index} className="activity-list">{block.items.map((item, row) => <li key={row}>{item}</li>)}</List>;
  })}</div>;
}

// A presentation of the local draft, not a saved worksheet or an export format.
// The student branch receives only the stripped student payload.
export default function WorksheetDraftDocument({ draft, audience = 'student', variant = 'default', heading, structuredDirections = false }) {
  const dayTask = variant === 'day-task';
  const student = studentDraftPreview(draft);
  const totalPoints = Math.round(student.questions.reduce((sum, item) => {
    const points = Number(item.points);
    return sum + (Number.isFinite(points) ? points : 0);
  }, 0) * 100) / 100;
  const answerById = audience === 'teacher'
    ? new Map(draft.answerKey.map(item => [item.localId, item.correct_answer])) : null;

  return <article className={dayTask ? 'worksheet-draft-document worksheet-draft-document--day-task' : 'worksheet-draft-document'} aria-label={audience === 'student' ? 'Student-facing worksheet' : 'Teacher answer key'}>
    <IlawHybridHeader />
    <h3>{audience === 'student' ? (dayTask && heading) || 'WORKSHEET' : 'TEACHER ANSWER KEY'}</h3>
    <p className="worksheet-draft-title">{student.title}</p>
    <div className="worksheet-draft-meta">
      <p><strong>Subject:</strong> {student.subjectName || 'Not specified'}</p>
      <p><strong>Grade:</strong> {student.gradeLevel || 'Not specified'}</p>
      {!(dayTask && totalPoints === 0) && <p><strong>Total points:</strong> {totalPoints}</p>}
    </div>
    {audience === 'student' && (dayTask ? <div className="worksheet-draft-student-fields">
      <p>Student name: <span className="line" aria-hidden="true" /></p>
      <p className="short">Section: <span className="line" aria-hidden="true" /></p>
    </div> : <div className="worksheet-draft-student-fields">
      <p>Student name: <span aria-hidden="true">____________________________</span></p>
      <p>Section: <span aria-hidden="true">________________</span></p>
    </div>)}
    {dayTask && structuredDirections && draft.instructions?.trim() ? <ActivityBody text={draft.instructions} />
      : draft.instructions?.trim()
      ? <p className="worksheet-draft-directions"><strong>Directions:</strong> {draft.instructions}</p>
      : !draft.sections && <p className="worksheet-draft-directions"><strong>Directions:</strong> Not provided in this local sample.</p>}
    {student.sections.map((section, sectionIndex) => <section key={sectionIndex} className="worksheet-draft-section"
      aria-label={section.title}>
      {draft.sections && <h4>{section.title}</h4>}
      {section.directions?.trim() && <p className="worksheet-draft-directions"><strong>Directions:</strong> {section.directions}</p>}
      <ol className="worksheet-draft-questions" start={section.questionIndexes[0] + 1 || 1}>
      {section.questionIndexes.map(index => {
        const item = student.questions[index];
        return <li key={draft.questions[index].localId}>
        <div className="worksheet-draft-question-heading">
          <span>{item.question}</span><span>{item.points} {Number(item.points) === 1 ? 'point' : 'points'}</span>
        </div>
        {audience === 'student' ? <>
          {item.options.length > 0 && <ul className="worksheet-draft-options">{item.options.map((option, optionIndex) =>
            <li key={`${optionIndex}-${option}`}>{option}</li>)}</ul>}
          {item.item_type === 'true_false' && <p>○ True &nbsp; ○ False</p>}
          {item.options.length === 0 && item.item_type !== 'true_false' && <div className="worksheet-draft-answer-space" aria-hidden="true" />}
        </> : <div className="worksheet-draft-key"><p><strong>Answer:</strong> {answerText(answerById.get(draft.questions[index].localId), item.item_type)}</p>
          {draft.questions[index].enumeration?.alternatives?.length > 0 && <p><strong>Accepted alternative lists:</strong> {draft.questions[index].enumeration.alternatives.join('; ')}</p>}
          {draft.questions[index].enumeration?.orderSensitive && <p>Order matters. Manual checking required.</p>}
          {draft.questions[index].essay && <>
            <p><strong>Reference answer:</strong> {draft.questions[index].essay.referenceAnswer}</p>
            <p><strong>Length:</strong> {draft.questions[index].essay.minWords}–{draft.questions[index].essay.maxWords} words</p>
            <ul>{draft.questions[index].essay.rubric.map((part, rubricIndex) =>
              <li key={rubricIndex}>{part.criterion}: {part.points} points</li>)}</ul>
          </>}
        </div>}
      </li>; })}
      </ol>
    </section>)}
  </article>;
}
