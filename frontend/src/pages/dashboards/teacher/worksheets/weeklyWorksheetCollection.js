import { createGeneratedDraft, validateGeneratedWorksheet } from './generatedDraftModel';
import { WEEKDAYS } from '../lessonPlans/weeklyWorksheetSource';
import { savedAiMetadata } from '../lessonPlans/aiAssignment';

export const WEEKLY_COLLECTION_VERSION = 1;

// In-memory authoring only. The collection and children have no database IDs.
export function createWeeklyWorksheetCollection({ plan, teacherId, sources, responses, questionCount, sourceWeek = '', teachingDate = '',
  collectionId = globalThis.crypto.randomUUID(), draftIdForDay, preserveQuestionOrder = false }) {
  if (!teacherId || plan?.teacher_id !== teacherId || !plan?.id || !plan?.title?.trim()
    || sources?.length !== 5
    || sources.some((source, index) => source.day !== WEEKDAYS[index]
      || !source.objective || !source.activity || !source.assessment)) {
    throw new Error('A complete owned five-day AI ILAW source is required.');
  }
  if (responses?.length !== 5) throw new Error('AI did not return five separate daily worksheets.');
  const metadata = savedAiMetadata(plan);
  const titleBase = plan.subject && plan.subject !== 'ILAW Lesson Plan'
    ? `${plan.subject}${plan.grade_level ? ` ${plan.grade_level.replace(/^Grade\s+/i, '')}` : ''}`
    : plan.title.replace(/\s+Lesson Plan$/i, '').trim();
  const worksheets = responses.map((response, index) => {
    const day = WEEKDAYS[index];
    if (response?.day !== day || response.status !== 'generated-draft' || response.saved !== false
      || response.sourceLessonPlan?.id !== plan.id || !Array.isArray(response.questions)
      || !Array.isArray(response.answerKey) || (questionCount && response.questions.length !== questionCount)) {
      throw new Error(`${day} did not return a usable worksheet draft.`);
    }
    const questionId = localId => `${collectionId}:${day}:${localId}`;
    const draft = createGeneratedDraft({ ...response,
      questions: response.questions.map(item => ({ ...item, localId: questionId(item.localId) })),
      answerKey: response.answerKey.map(item => ({ ...item, localId: questionId(item.localId) })),
      sourceLessonPlan: { id: plan.id, title: plan.title },
      subjectId: metadata.subjectId, subjectName: metadata.subjectName,
      gradeLevel: metadata.gradeLevel, schoolYear: metadata.schoolYear }, 'ai');
    const worksheet = { ...draft, draftId: draftIdForDay?.(day) || draft.draftId, collectionId, day, version: 1,
      title: response.title, sourceContext: { ...sources[index] } };
    if (validateGeneratedWorksheet(worksheet).length) throw new Error(`${day} worksheet needs Teacher review.`);
    return preserveQuestionOrder ? worksheet : shuffleWeeklyWorksheet(worksheet);
  });
  return {
    kind: 'weekly-worksheet-collection', version: WEEKLY_COLLECTION_VERSION,
    collectionId, teacherId, sourceLessonPlan: { id: plan.id, title: plan.title },
    title: `${titleBase} — Weekly Worksheets`,
    subjectId: metadata.subjectId, subjectName: metadata.subjectName,
    gradeLevel: metadata.gradeLevel, academicYear: metadata.schoolYear,
    sourceWeek, teachingDate, status: 'local-draft', saved: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), worksheets,
  };
}

// Adapt only a completed, authorized draft-job result for in-memory editing.
// The job ID keeps a repeated handoff on the same local collection identity.
export function createWeeklyJobDraftCollection({ jobId, result, teacherId }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)
    || result?.kind !== 'weekly-worksheet-collection' || result.status !== 'local-draft'
    || result.saved !== false || result.teacherId !== teacherId
    || !result.sourceLessonPlan?.id || !result.sourceLessonPlan.title?.trim()
    || !Array.isArray(result.worksheets) || result.worksheets.length !== WEEKDAYS.length
    || ![20, 30, 40].includes(result.worksheets[0]?.questions?.length)
    || result.worksheets.some((day, index) => day?.day !== WEEKDAYS[index]
      || day.sourceLessonPlan?.id !== result.sourceLessonPlan.id
      || !day.sourceContext || day.questions?.length !== result.worksheets[0].questions.length)) {
    throw new Error('The completed weekly draft cannot be opened.');
  }
  const first = result.worksheets[0];
  const plan = { id: result.sourceLessonPlan.id, title: result.sourceLessonPlan.title,
    teacher_id: teacherId, subject_id: first.subjectId || null,
    subject: first.subjectName || null, grade_level: first.gradeLevel || null,
    academic_year: first.schoolYear || null };
  return createWeeklyWorksheetCollection({ plan, teacherId, collectionId: jobId,
    sources: result.worksheets.map(day => day.sourceContext), responses: result.worksheets,
    questionCount: first.questions.length, draftIdForDay: day => `${jobId}:${day}`,
    preserveQuestionOrder: true });
}

export function shuffleWeeklyWorksheet(worksheet, random = Math.random) {
  const questions = (worksheet.sections || [{ id: 'worksheet-section-1' }]).flatMap(section => {
    const group = worksheet.questions.filter(item => (item.sectionId || 'worksheet-section-1') === section.id);
    for (let index = group.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [group[index], group[other]] = [group[other], group[index]];
    }
    return group;
  });
  return { ...worksheet, questions };
}

export function updateWeeklyWorksheet(collection, worksheet) {
  if (collection?.kind !== 'weekly-worksheet-collection' || worksheet?.collectionId !== collection.collectionId
    || !collection.worksheets.some(item => item.draftId === worksheet.draftId && item.day === worksheet.day)) {
    throw new Error('This worksheet does not belong to the open weekly collection.');
  }
  return { ...collection, updatedAt: new Date().toISOString(), worksheets: collection.worksheets.map(item =>
    item.draftId === worksheet.draftId ? worksheet : item) };
}
