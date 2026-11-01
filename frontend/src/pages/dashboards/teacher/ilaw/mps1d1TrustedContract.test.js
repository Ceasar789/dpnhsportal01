import { describe, expect, it } from 'vitest';
import { createBlankIlawDocument } from './ilawTemplateModel';
import { parseManualIlawV2 } from './manualIlawV2';
import { authorizeFutureHtmlWrite, authorizeManualWrite, trustedSchoolYear,
  validateManualV2Content } from '../../../../../ilaw-preview/trustedWriteContract';
import { createSyntheticTrustedPlanStore } from '../../../../../ilaw-preview/syntheticTrustedPlanStore';

const instant = new Date('2026-10-16T00:00:00.000Z');
const assignment = { teacherId: 'synthetic-teacher-a', subjectId: 'synthetic-science',
  subjectName: 'Science', gradeLevel: 'Grade 7', schoolYear: '2026-2027' };
const context = () => ({ authUserId: 'synthetic-teacher-a',
  profile: { id: 'synthetic-teacher-a', role: 'teacher', status: 'active' }, assignments: [assignment] });
const payload = (state = 'draft') => {
  const document = createBlankIlawDocument({ subject: 'Science', grade: 'Grade 7, A' });
  document.info.nameOfLesson = 'Cells';
  document.info.teachingDate = '2026-10-16';
  document.weekly.flow.Monday = 'Compare plant and animal cells.';
  document.weekly.formativeAssessment.Friday = 'Identify each cell part.';
  return { kind: 'eduscribe.manual-ilaw', version: 2, teacherId: 'synthetic-teacher-a',
    planId: 'synthetic-plan-a', title: 'Cells', assignment: {
      subjectId: assignment.subjectId, subjectName: assignment.subjectName,
      gradeLevel: assignment.gradeLevel, schoolYear: assignment.schoolYear,
    }, workflowState: state, document,
    sourceDetails: { classDuration: '45', teachingStrategy: 'Inquiry', learningObjectives: 'Describe cell parts.' } };
};
const decide = (changes = {}) => authorizeManualWrite({ context: context(), payload: payload(),
  operation: 'create', instant, ...changes });

describe('trusted Manila academic year (isolated pure function)', () => {
  it.each([
    ['2026-05-31T15:59:59.000Z', '2025-2026'], // 23:59:59 Manila
    ['2026-05-31T16:00:00.000Z', '2026-2027'], // midnight June 1 Manila
    ['2026-01-15T00:00:00.000Z', '2025-2026'],
    ['2026-10-15T16:00:00.000Z', '2026-2027'],
    ['2026-12-31T15:59:59.000Z', '2026-2027'],
    ['2026-12-31T16:00:00.000Z', '2026-2027'],
  ])('resolves %s to %s using Manila time', (iso, expected) => {
    expect(trustedSchoolYear(new Date(iso))).toBe(expected);
  });
  it('rejects missing, invalid, and client-style string instants', () => {
    expect(() => trustedSchoolYear()).toThrow(TypeError);
    expect(() => trustedSchoolYear(new Date('invalid'))).toThrow(TypeError);
    expect(() => trustedSchoolYear('2026-10-16')).toThrow(TypeError);
  });
});

describe('Manual Version 2 content validation', () => {
  it('allows an incomplete structured Draft and does not fabricate content', () => {
    const value = payload('draft');
    value.document = createBlankIlawDocument();
    value.title = '';
    expect(validateManualV2Content(value)).toEqual({});
    expect(decide({ payload: value }).authorized).toBe(true);
  });
  it('accepts one meaningful entry in supported lesson-wide and weekday fields', () => {
    const value = payload('saved');
    expect(validateManualV2Content(value)).toEqual({});
    expect(decide({ payload: value }).privateStatus).toBe('draft');
    value.sourceDetails.learningObjectives = '';
    value.document.weekly.learningObjectives.Wednesday = 'Explain cells.';
    value.document.weekly.flow.Monday = '';
    value.document.weekly.preLesson.Tuesday = 'Observe a slide.';
    expect(validateManualV2Content(value)).toEqual({});
  });
  it.each([
    ['nameOfLesson', 'document.info.nameOfLesson'],
    ['teachingDate', 'document.info.teachingDate'],
    ['learningArea', 'document.info.learningArea'],
    ['gradeSection', 'document.info.gradeSection'],
  ])('returns a stable path for missing %s', (field, path) => {
    const value = payload('saved');
    value.document.info[field] = '   ';
    if (field === 'nameOfLesson') value.title = '   ';
    expect(validateManualV2Content(value)[path]).toMatch(/required/);
  });
  it('rejects placeholders and whitespace for objectives, activity, and assessment', () => {
    const value = payload('saved');
    value.sourceDetails.learningObjectives = 'TBD';
    value.document.weekly.flow.Monday = '   ';
    value.document.weekly.formativeAssessment.Friday = '[assessment]';
    expect(validateManualV2Content(value)).toMatchObject({
      'sourceDetails.learningObjectives': expect.any(String),
      'document.weekly.flow': expect.any(String),
      'document.weekly.formativeAssessment': expect.any(String),
    });
    const denied = decide({ payload: value });
    expect(denied.code).toBe('incomplete_saved_document');
    expect(denied.errors['document.weekly.flow']).toBeTruthy();
  });
  it('accepts ordinary instructional verbs that are not placeholders', () => {
    const value = payload('saved');
    value.sourceDetails.learningObjectives = 'Add two fractions accurately.';
    value.document.weekly.flow.Monday = 'Write a short explanation of the result.';
    expect(validateManualV2Content(value)).toEqual({});
  });
  it('preserves all weekdays, signatories, strategy and session details after authorization', () => {
    const value = payload('saved');
    value.document.info.sessions = '5';
    value.document.signatures.checkedBy.name = 'Fictional reviewer';
    value.document.weekly.reflections.Thursday = 'Observed progress.';
    const result = decide({ payload: value });
    expect(result.authorized).toBe(true);
    expect(result.payload.document).toEqual(value.document);
    expect(result.payload.sourceDetails).toEqual(value.sourceDetails);
  });
  it('rejects damaged structure and unsupported version without filling fields', () => {
    expect(decide({ payload: { ...payload(), version: 3 } }).code).toBe('invalid_payload');
    expect(decide({ payload: { ...payload(), document: {} } }).code).toBe('invalid_payload');
  });
});

describe('isolated Manual authorization decisions', () => {
  it.each([
    ['missing session', { context: { ...context(), authUserId: null } }, 'not_authenticated'],
    ['forged Teacher', { payload: { ...payload(), teacherId: 'another-teacher' } }, 'wrong_owner'],
    ['inactive Teacher', { context: { ...context(), profile: { ...context().profile, status: 'suspended' } } }, 'inactive_teacher'],
    ['wrong role', { context: { ...context(), profile: { ...context().profile, role: 'student' } } }, 'invalid_role'],
    ['withdrawn assignment', { context: { ...context(), assignments: [{ ...assignment, active: false }] } }, 'missing_assignment'],
    ['adviser only', { context: { ...context(), assignments: [] } }, 'missing_assignment'],
    ['wrong subject', { payload: { ...payload(), assignment: { ...payload().assignment, subjectId: 'other' } } }, 'subject_mismatch'],
    ['wrong grade', { payload: { ...payload(), assignment: { ...payload().assignment, gradeLevel: 'Grade 8' } } }, 'grade_mismatch'],
    ['wrong year', { payload: { ...payload(), assignment: { ...payload().assignment, schoolYear: '2025-2026' } } }, 'year_mismatch'],
    ['forged display name', { payload: { ...payload(), assignment: { ...payload().assignment, subjectName: 'Fake Science' } } }, 'subject_mismatch'],
  ])('denies %s', (_label, changes, code) => expect(decide(changes).code).toBe(code));

  it('uses trusted Manila instant even if submitted document date is in another year', () => {
    const value = payload();
    value.document.info.teachingDate = '2030-01-01';
    expect(decide({ payload: value }).authorized).toBe(true);
    expect(decide({ payload: value, instant: new Date('2026-05-31T15:59:59Z') }).code).toBe('year_mismatch');
  });
  it('does not expose another Teacher row details', () => {
    const row = { id: 'synthetic-plan-a', teacher_id: 'synthetic-teacher-b', revision: 1 };
    expect(decide({ operation: 'update', existing: row, expectedRevision: 1 })).toEqual({ authorized: false, code: 'wrong_owner' });
  });
  it('rejects grade prefixes that are not the official grade', () => {
    const value = payload();
    value.document.info.gradeSection = 'Grade 70';
    expect(decide({ payload: value }).code).toBe('invalid_payload');
  });
});

describe('synthetic private write, revision and idempotency rehearsal', () => {
  const command = (store, options = {}) => store.writeManual({ context: context(), payload: payload(),
    operation: 'create', requestId: 'request-one', instant, ...options });
  it('creates Draft and Saved privately with no side-effect fields', () => {
    const draftStore = createSyntheticTrustedPlanStore();
    const draft = command(draftStore);
    const saved = command(createSyntheticTrustedPlanStore(), { payload: payload('saved') });
    expect(draft.row.status).toBe('draft');
    expect(saved.row.status).toBe('draft');
    expect(parseManualIlawV2(saved.row.objectives).workflowState).toBe('saved');
    expect(Object.keys(saved.row).sort()).toEqual(['ai_generated', 'grade_level', 'id', 'objectives',
      'revision', 'status', 'subject', 'teacher_id', 'title']);
  });
  it('promotes Draft, updates Saved with same ID, and rejects downgrade', () => {
    const store = createSyntheticTrustedPlanStore();
    const draft = command(store).row;
    const saved = command(store, { operation: 'update', requestId: 'request-two',
      expectedRevision: draft.revision, payload: payload('saved') }).row;
    expect(saved.id).toBe(draft.id);
    expect(saved.revision).toBe(2);
    const edited = command(store, { operation: 'update', requestId: 'request-three',
      expectedRevision: saved.revision, payload: payload('saved') });
    expect(edited.row.id).toBe(draft.id);
    expect(command(store, { operation: 'update', requestId: 'request-four',
      expectedRevision: edited.row.revision, payload: payload('draft') }).code).toBe('unsupported_transition');
  });
  it('permits Draft-to-Draft on the same ID', () => {
    const store = createSyntheticTrustedPlanStore();
    const draft = command(store).row;
    const edited = command(store, { operation: 'update', requestId: 'draft-update', expectedRevision: 1 });
    expect(edited.row.id).toBe(draft.id);
    expect(parseManualIlawV2(edited.row.objectives).workflowState).toBe('draft');
  });
  it('rejects stale revision, wrong owner, and duplicate plan create', () => {
    const store = createSyntheticTrustedPlanStore();
    command(store);
    expect(command(store, { operation: 'update', requestId: 'stale', expectedRevision: 0 }).code).toBe('revision_conflict');
    expect(command(store, { operation: 'create', requestId: 'duplicate' }).code).toBe('revision_conflict');
    expect(command(store, { operation: 'update', requestId: 'wrong-owner', expectedRevision: 1,
      context: { ...context(), authUserId: 'synthetic-teacher-b' } }).code).toBe('inactive_teacher');
  });
  it('reconciles an ambiguous response by request ID without a second create', () => {
    const store = createSyntheticTrustedPlanStore();
    const result = command(store, { loseResponse: true });
    expect(result.code).toBe('ambiguous_response');
    expect(store.listRows()).toHaveLength(1);
    expect(store.reconcile({ authUserId: context().authUserId, requestId: 'request-one' }).id).toBe('synthetic-plan-a');
    expect(command(store).code).toBe('reconciled');
    expect(store.listRows()).toHaveLength(1);
    expect(command(store, { payload: payload('saved') }).code).toBe('request_conflict');
  });
});

describe('future-only AI/HTML authorization seam', () => {
  const request = () => ({ operation: 'create', title: 'Synthetic AI lesson', html: '<h1>Cells</h1>',
    assignment: payload().assignment });
  const decideHtml = (changes = {}) => authorizeFutureHtmlWrite({ context: context(), request: request(), instant, ...changes });
  it('requires assignment and private state, without returning a storable unsanitized row', () => {
    const result = decideHtml();
    expect(result).toMatchObject({ authorized: true, privateStatus: 'draft',
      serverClassification: 'ai-html', requiresTrustedSanitization: true });
    expect(result).not.toHaveProperty('row');
  });
  it('rejects Manual JSON, client classification/status, and forged identity', () => {
    expect(decideHtml({ request: { ...request(), html: JSON.stringify(payload()) } }).code).toBe('invalid_payload');
    expect(decideHtml({ request: { ...request(), ai_generated: true } }).code).toBe('invalid_payload');
    expect(decideHtml({ request: { ...request(), status: 'published' } }).code).toBe('invalid_payload');
    expect(decideHtml({ request: { ...request(), teacherId: 'other' } }).code).toBe('wrong_owner');
  });
  it('requires an official current-year assignment and rejects wrong-owner updates', () => {
    expect(decideHtml({ context: { ...context(), assignments: [] } }).code).toBe('missing_assignment');
    expect(decideHtml({ request: { ...request(), assignment: { ...request().assignment, gradeLevel: 'Grade 8' } } }).code).toBe('grade_mismatch');
    expect(decideHtml({ request: { ...request(), operation: 'update', planId: 'legacy-plan', expectedRevision: 1 },
      existing: { id: 'legacy-plan', teacher_id: 'another-teacher', revision: 1 } }).code).toBe('wrong_owner');
  });
  it('permits an owned legacy HTML update in the isolated contract without altering content', () => {
    const legacy = { id: 'legacy-plan', teacher_id: context().authUserId, revision: 1,
      status: 'draft', objectives: '<p>Existing lesson</p>', ai_generated: false };
    const result = decideHtml({ request: { ...request(), operation: 'update', planId: legacy.id, expectedRevision: 1 }, existing: legacy });
    expect(result.authorized).toBe(true);
    expect(legacy.objectives).toBe('<p>Existing lesson</p>');
    expect(decideHtml({ request: { ...request(), operation: 'update', planId: legacy.id, expectedRevision: 1 },
      existing: { ...legacy, objectives: JSON.stringify(payload()) } }).code).toBe('invalid_payload');
  });
});
