import { normalizeGradeLevel } from '../../../../lib/academicRules';
import { studentDraftPreview, validateGeneratedWorksheet } from './generatedDraftModel';

// This model accepts only injected synthetic QA data. It is not a substitute
// for database authorization and must never be used to issue real assignments.
export function localDistributionOptions(draft, fixture, teacherId, schoolYear) {
  if (!draft?.saved || draft.status !== 'local-saved' || draft.id || !draft.draftId
    || !draft.sourceLessonPlan?.id || !draft.subjectId || !normalizeGradeLevel(draft.gradeLevel)
    || validateGeneratedWorksheet(draft).length || !teacherId || !schoolYear
    || fixture?.synthetic !== true || fixture.teacherId !== teacherId
    || fixture.schoolYear !== schoolYear) return [];

  const load = (Array.isArray(fixture.teachingLoads) ? fixture.teachingLoads : []).filter(row => row.id && row.teacher_id === teacherId
    && row.subject_id === draft.subjectId && row.school_year === schoolYear
    && row.active !== false && normalizeGradeLevel(row.grade_level) === normalizeGradeLevel(draft.gradeLevel));
  if (!load.length) return [];

  const options = new Map();
  for (const schedule of Array.isArray(fixture.schedules) ? fixture.schedules : []) {
    if (!schedule.id || !schedule.section_id || schedule.teacher_id !== teacherId
      || schedule.subject_id !== draft.subjectId || schedule.school_year !== schoolYear
      || schedule.active === false) continue;
    const section = (Array.isArray(fixture.sections) ? fixture.sections : []).find(row => row.id === schedule.section_id
      && row.school_year === schoolYear && row.active !== false
      && normalizeGradeLevel(row.grade_level) === normalizeGradeLevel(draft.gradeLevel));
    if (!section?.name || options.has(section.id)) continue;

    const seen = new Set();
    const recipients = [];
    let excludedCount = 0;
    for (const row of Array.isArray(fixture.enrollments) ? fixture.enrollments : []) {
      if (row.section_id !== section.id) continue;
      if (row.status !== 'active' || typeof row.student_id !== 'string'
        || !row.student_id.trim() || row.valid === false || seen.has(row.student_id)) {
        excludedCount += 1;
        continue;
      }
      seen.add(row.student_id);
      recipients.push(row.student_id);
    }
    options.set(section.id, {
      assignmentId: load[0].id, scheduleId: schedule.id, sectionId: section.id,
      sectionName: section.name, subjectId: draft.subjectId,
      subjectName: draft.subjectName || load[0].subjects?.name || 'Unknown',
      gradeLevel: draft.gradeLevel, schoolYear, recipientIds: recipients, excludedCount,
    });
  }
  return [...options.values()].sort((a, b) => a.sectionName.localeCompare(b.sectionName));
}

export function simulateLocalDistribution(draft, option, dueDate, previous = []) {
  if (!draft?.saved || draft.id || !draft.draftId || !draft.sourceLessonPlan?.id
    || !option?.assignmentId || !option.sectionId || !option.schoolYear
    || !Array.isArray(option.recipientIds) || !option.recipientIds.length
    || validateGeneratedWorksheet(draft).length) throw new Error('This worksheet or class is not eligible.');
  if (dueDate) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
    const end = match && new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59);
    if (!end || end.getFullYear() !== Number(match[1]) || end.getMonth() + 1 !== Number(match[2])
      || end.getDate() !== Number(match[3]) || end.getTime() < Date.now()) {
      throw new Error('Choose a valid future due date or leave it blank.');
    }
  }
  if (previous.some(row => row.worksheetId === draft.draftId && row.sectionId === option.sectionId)) {
    throw new Error('Distribution was already simulated for this section.');
  }
  return {
    worksheetId: draft.draftId, worksheetTitle: draft.title,
    sourceLessonPlanId: draft.sourceLessonPlan.id, assignmentId: option.assignmentId,
    subjectId: option.subjectId, subjectName: option.subjectName,
    gradeLevel: option.gradeLevel, sectionId: option.sectionId, sectionName: option.sectionName,
    schoolYear: option.schoolYear, recipientIds: [...option.recipientIds],
    recipientCount: option.recipientIds.length, dueDate: dueDate || null,
    status: 'simulated-locally', studentWorksheet: {
      ...studentDraftPreview(draft), subjectName: option.subjectName, gradeLevel: option.gradeLevel,
    },
  };
}
