import { createGeneratedDraft, validateGeneratedWorksheet } from './generatedDraftModel';
import { WEEKDAYS } from '../lessonPlans/weeklyWorksheetSource';
import { savedAiMetadata } from '../lessonPlans/aiAssignment';

export const WEEKLY_COLLECTION_VERSION = 1;

// In-memory authoring only. The collection and children have no database IDs.
export function createWeeklyWorksheetCollection({ plan, teacherId, sources, responses, questionCount, sourceWeek = '', teachingDate = '' }) {
  if (!teacherId || plan?.teacher_id !== teacherId || !plan?.id || !plan?.title?.trim()
    || sources?.length !== 5
    || sources.some((source, index) => source.day !== WEEKDAYS[index]
      || !source.objective || !source.activity || !source.assessment)) {
    throw new Error('A complete owned five-day AI ILAW source is required.');
  }
  if (responses?.length !== 5) throw new Error('AI did not return five separate daily worksheets.');
  const collectionId = globalThis.crypto.randomUUID();
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
    const worksheet = { ...draft, collectionId, day, version: 1,
      title: response.title, sourceContext: { ...sources[index] } };
    if (validateGeneratedWorksheet(worksheet).length) throw new Error(`${day} worksheet needs Teacher review.`);
    return shuffleWeeklyWorksheet(worksheet);
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
