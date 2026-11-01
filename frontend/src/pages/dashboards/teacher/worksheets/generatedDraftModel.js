import { ITEM_TYPES, TRUE_FALSE_VALUES, splitAcceptedAnswers } from '../../../../lib/worksheetChecking';

const LEGACY_SECTION_ID = 'worksheet-section-1';

export function worksheetSections(draft) {
  return Array.isArray(draft?.sections) && draft.sections.length
    ? draft.sections.map(section => ({ ...section }))
    : [{ id: LEGACY_SECTION_ID, title: 'Questions', directions: '' }];
}

export function orderedWorksheetItems(items, sections) {
  return [
    ...sections.flatMap(section => items.filter(item =>
      (item.sectionId || LEGACY_SECTION_ID) === section.id)),
    ...items.filter(item => !sections.some(section => section.id === (item.sectionId || LEGACY_SECTION_ID))),
  ];
}

// Local draft only. No worksheet database ID or persistence payload is created.
export function createGeneratedDraft(generated, sourceType) {
  if (generated?.status !== 'generated-draft' || generated.saved !== false
    || !['ai', 'manual'].includes(sourceType) || !generated.sourceLessonPlan?.id
    || !generated.title?.trim() || !Array.isArray(generated.questions) || !generated.questions.length
    || !Array.isArray(generated.answerKey) || generated.questions.some(item =>
      !item?.localId || !item.question?.trim() || !Array.isArray(item.options)
      || !Number.isFinite(Number(item.points)) || Number(item.points) < 0)
    || new Set(generated.questions.map(item => item.localId)).size !== generated.questions.length
    || generated.answerKey.some(key => !generated.questions.some(item => item.localId === key?.localId))) {
    throw new Error('The generated worksheet draft is incomplete.');
  }
  const sections = worksheetSections(generated);
  if (new Set(sections.map(section => section.id)).size !== sections.length
    || sections.some(section => !section.id || typeof section.title !== 'string'
      || typeof section.directions !== 'string')
    || generated.questions.some(item => !sections.some(section =>
      section.id === (item.sectionId || LEGACY_SECTION_ID)))) {
    throw new Error('The generated worksheet sections are incomplete.');
  }
  return {
    draftId: globalThis.crypto.randomUUID(), status: 'generated-draft', saved: false,
    sourceType, sourceLessonPlan: { ...generated.sourceLessonPlan },
    generationLabel: generated.generationLabel || '',
    typeDistribution: generated.typeDistribution || null,
    distributionNote: generated.distributionNote || '',
    title: generated.title, instructions: generated.instructions || '', subjectId: generated.subjectId,
    subjectName: generated.subjectName, gradeLevel: generated.gradeLevel, schoolYear: generated.schoolYear || '',
    assignmentVerified: generated.assignmentVerified === true,
    checkingMode: 'manual',
    sections,
    questions: generated.questions.map(item => ({ ...item, sectionId: item.sectionId || LEGACY_SECTION_ID, options: [...item.options] })),
    answerKey: generated.answerKey.map(item => ({ ...item })),
  };
}

// An in-memory authoring document. It has no database ID or lesson-plan source.
export function createManualWorksheetDraft(teacherId, schoolYear) {
  if (!teacherId || !/^(\d{4})-(\d{4})$/.test(schoolYear || '')
    || Number(schoolYear.slice(5)) !== Number(schoolYear.slice(0, 4)) + 1) {
    throw new Error('Official academic year is unavailable.');
  }
  return {
    draftId: globalThis.crypto.randomUUID(), teacherId, schoolYear,
    status: 'manual-draft', saved: false, sourceType: 'manual-authored',
    title: '', instructions: '', subjectId: '', subjectName: '', gradeLevel: '',
    assignmentVerified: false, checkingMode: 'manual',
    sections: [{ id: globalThis.crypto.randomUUID(), title: 'Questions', directions: '' }],
    questions: [], answerKey: [],
  };
}

export function editableDraftItems(draft) {
  const answers = new Map((draft.answerKey || []).map(item => [item.localId, item.correct_answer]));
  return (draft.questions || []).map(item => ({
    uid: item.localId, sectionId: item.sectionId || LEGACY_SECTION_ID,
    question: item.question, item_type: item.item_type,
    options: item.item_type === 'multiple_choice' ? [...item.options] : [],
    points: item.points, correct_answer: answers.get(item.localId) || '',
    ...(item.enumeration ? { enumeration: structuredClone(item.enumeration) } : {}),
    ...(item.essay ? { essay: structuredClone(item.essay) } : {}),
  }));
}

export function updateGeneratedDraft(original, { title, instructions = original.instructions || '', items, checkingMode,
  sections = worksheetSections(original), assignment }) {
  const orderedItems = orderedWorksheetItems(items, sections);
  const questions = orderedItems.map(item => ({
    localId: item.uid, sectionId: item.sectionId || LEGACY_SECTION_ID,
    question: item.question, item_type: item.item_type,
    options: item.item_type === 'multiple_choice' ? [...item.options] : [],
    points: item.points,
    ...(item.item_type === 'essay' && item.essay ? { essay: structuredClone(item.essay) } : {}),
    ...(item.item_type === 'enumeration' && item.enumeration ? { enumeration: structuredClone(item.enumeration) } : {}),
  }));
  const answerKey = orderedItems.filter(item => item.item_type !== 'essay').map(item => ({
    localId: item.uid, correct_answer: item.correct_answer,
  }));
  return { ...original, title, instructions, checkingMode, sections, questions, answerKey, ...(assignment || {}) };
}

export function validateGeneratedWorksheet(draft) {
  const errors = [];
  if (!draft.title?.trim()) errors.push({ field: 'title', message: 'Enter a worksheet title.' });
  if (typeof draft.instructions !== 'string' || draft.instructions.length > 2000) errors.push({ field: 'instructions', message: 'Keep directions within 2,000 characters.' });
  const sections = worksheetSections(draft);
  if (new Set(sections.map(section => section.id)).size !== sections.length) {
    errors.push({ field: 'sections', message: 'Question sections must have distinct identities.' });
  }
  sections.forEach((section, index) => {
    if (!section.title?.trim() || section.title.length > 120 || typeof section.directions !== 'string'
      || section.directions.length > 2000) {
      errors.push({ field: `section-${index + 1}`, message: `Enter a section name and keep its directions within 2,000 characters.` });
    }
  });
  if (draft.questions?.some(item => !sections.some(section => section.id === (item.sectionId || LEGACY_SECTION_ID)))) {
    errors.push({ field: 'sections', message: 'Assign every question to a section.' });
  }
  if (!draft.questions?.length) errors.push({ field: 'items', message: 'Add at least one question.' });
  // shortcut: enhanced enumeration is manual-only, add trusted scoring support before enabling auto-checking.
  if (draft.checkingMode === 'auto' && draft.questions?.some(item => item.item_type === 'enumeration'
    && (item.enumeration?.orderSensitive || item.enumeration?.alternatives?.length))) {
    errors.push({ field: 'checkingMode', message: 'Use manual checking for enumeration alternatives or order-sensitive answers.' });
  }
  const keys = new Map((draft.answerKey || []).map(key => [key.localId, key.correct_answer]));
  (draft.questions || []).forEach((item, index) => {
    const prefix = `question-${index + 1}`;
    if (!item.question?.trim()) errors.push({ field: `${prefix}-text`, message: `Enter text for question ${index + 1}.` });
    if (!ITEM_TYPES.includes(item.item_type)) errors.push({ field: `${prefix}-type`, message: `Choose a supported type for question ${index + 1}.` });
    if (item.points === '' || item.points === null || !Number.isFinite(Number(item.points)) || Number(item.points) < 0) {
      errors.push({ field: `${prefix}-points`, message: `Enter valid non-negative points for question ${index + 1}.` });
    }
    const answer = keys.get(item.localId);
    if (item.item_type === 'multiple_choice') {
      const choices = (item.options || []).map(value => value.trim()).filter(Boolean);
      if (new Set(choices).size < 2) errors.push({ field: `${prefix}-choices`, message: `Enter at least two different choices for question ${index + 1}.` });
      if (!answer || !choices.includes(answer)) errors.push({ field: `${prefix}-answer`, message: `Choose a valid correct choice for question ${index + 1}.` });
    } else if (item.item_type === 'true_false' && !TRUE_FALSE_VALUES.includes(answer)) {
      errors.push({ field: `${prefix}-answer`, message: `Choose a correct answer for question ${index + 1}.` });
    } else if (['identification', 'enumeration'].includes(item.item_type) && !splitAcceptedAnswers(answer).length) {
      errors.push({ field: `${prefix}-answer`, message: `Enter usable accepted answers for question ${index + 1}.` });
    }
    if (item.item_type === 'enumeration' && item.enumeration && (!Array.isArray(item.enumeration.alternatives)
      || typeof item.enumeration.orderSensitive !== 'boolean'
      || item.enumeration.alternatives.some(value => splitAcceptedAnswers(value).length !== splitAcceptedAnswers(answer).length))) {
      errors.push({ field: `${prefix}-answer`, message: `Complete each alternative answer list for question ${index + 1}.` });
    }
    if (draft.collectionId && item.item_type === 'essay') {
      const essay = item.essay;
      if (!essay?.referenceAnswer?.trim() || !Number.isInteger(Number(essay.minWords))
        || !Number.isInteger(Number(essay.maxWords)) || Number(essay.minWords) < 1
        || Number(essay.maxWords) < Number(essay.minWords) || Number(essay.maxWords) > 3000
        || !Array.isArray(essay.rubric) || !essay.rubric.length
        || essay.rubric.some(part => !part.criterion?.trim() || !Number.isFinite(Number(part.points)) || Number(part.points) <= 0)
        || Math.abs(essay.rubric.reduce((sum, part) => sum + Number(part.points), 0) - Number(item.points)) > 0.001) {
        errors.push({ field: `${prefix}-essay`, message: `Complete the reference answer, word limits, and point-matched rubric for essay ${index + 1}.` });
      }
    }
  });
  return errors;
}

const localContent = draft => ({
  title: draft.title,
  instructions: draft.instructions || '',
  subjectId: draft.subjectId, subjectName: draft.subjectName, gradeLevel: draft.gradeLevel,
  sections: worksheetSections(draft),
  checkingMode: draft.checkingMode,
  questions: draft.questions.map(item => ({ ...item, options: [...item.options],
    ...(item.essay ? { essay: structuredClone(item.essay) } : {}),
    ...(item.enumeration ? { enumeration: structuredClone(item.enumeration) } : {}) })),
  answerKey: draft.answerKey.map(key => ({ ...key,
    correct_answer: Array.isArray(key.correct_answer) ? [...key.correct_answer] : key.correct_answer })),
});

export function saveGeneratedWorksheetLocally(draft, officialSchoolYear) {
  if (!import.meta.env.DEV || !draft?.draftId || draft.id
    || (draft.sourceType === 'manual-authored'
      ? !draft.teacherId || !officialSchoolYear || draft.schoolYear !== officialSchoolYear || !draft.assignmentVerified
      : !draft.sourceLessonPlan?.id)) {
    throw new Error('Local worksheet saving is only available for eligible development drafts.');
  }
  if (validateGeneratedWorksheet(draft).length) throw new Error('Correct the highlighted worksheet fields before saving.');
  return { ...draft, saved: true, status: 'local-saved', localSavedContent: localContent(draft) };
}

export function hasUnsavedGeneratedChanges(draft) {
  return !draft.saved || !draft.localSavedContent
    || JSON.stringify(localContent(draft)) !== JSON.stringify(draft.localSavedContent);
}

export function restoreLocallySavedWorksheet(draft) {
  return draft.localSavedContent ? { ...draft, ...localContent(draft.localSavedContent) } : draft;
}

// The only structure the isolated student preview receives. Never spread the
// draft into a student-facing payload: it includes the Teacher answer key.
export function studentDraftPreview(draft) {
  const sections = worksheetSections(draft);
  return {
    title: draft.title, instructions: draft.instructions || '', subjectName: draft.subjectName, gradeLevel: draft.gradeLevel,
    sections: sections.map(section => ({ title: section.title, directions: section.directions,
      questionIndexes: draft.questions.flatMap((item, index) =>
        (item.sectionId || LEGACY_SECTION_ID) === section.id ? [index] : []) })),
    questions: draft.questions.map(item => ({
      question: item.question, item_type: item.item_type,
      options: item.item_type === 'multiple_choice' ? [...item.options] : [],
      points: item.points,
    })),
  };
}
