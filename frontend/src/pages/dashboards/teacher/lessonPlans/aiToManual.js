// R36 (4g, Q10): "Edit as manual" COPIES an AI lesson plan into a new Manual
// ILAW draft. The AI plan is read only, never changed or deleted. The mapping
// is best effort and only moves text the AI plan really has: the title, the
// subject and grade, the weekly competency, the teaching date / week and, per
// weekday, objective -> Learning Objectives, activity -> Flow and assessment ->
// Formative Assessment (the same reader Generate Task uses). Everything else
// stays blank for the teacher to fill.
import { createTemporaryManualIlawDraft } from '../ilaw/fullManualIlawModel';
import { extractWeeklyWorksheetSource } from './weeklyWorksheetSource';

const FIELD_FOR = { objective: 'learningObjectives', activity: 'flow', assessment: 'formativeAssessment' };
const text = value => (typeof value === 'string' ? value.trim() : '');

export function manualDraftFromAiPlan(plan, teacherId, teacherProfile) {
  const draft = createTemporaryManualIlawDraft(teacherId, teacherProfile);
  const source = extractWeeklyWorksheetSource(plan?.objectives || '');
  const info = draft.document.info;
  info.nameOfLesson = text(plan?.title);
  info.learningArea = text(plan?.subject);
  info.gradeSection = text(plan?.grade_level);
  info.teachingDate = text(source.teachingDate);
  info.termWeek = text(source.sourceWeek);
  let copied = 0;
  for (const day of source.days) {
    if (!draft.document.learningCompetency && text(day.competency)) draft.document.learningCompetency = text(day.competency);
    for (const [from, to] of Object.entries(FIELD_FOR)) {
      if (text(day[from])) { draft.document.weekly[to][day.day] = text(day[from]); copied += 1; }
    }
  }
  return { draft, copied };
}
