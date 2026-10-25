import { describe, it, expect, vi } from 'vitest';
import { createEditorPersistence, editorPersistence, worksheetEditorDocument, manualEditorDocument } from './editorPersistence';
import { createBlankIlawDocument } from '../ilaw/ilawTemplateModel';
const selection = { subjectId: 'science', gradeLevel: 'Grade 7', schoolYear: '2034-2035' };
const draft = { title: '', teacherId: 'forged', schoolYear: '1900-1901', assignmentVerified: true,
  sections: [{ id: 'g', title: '', directions: 'Keep this direction' }],
  questions: [{ localId: 'q', sectionId: 'g', question: '', item_type: '', options: [''], points: '' }], answerKey: [] };
describe('trusted editor boundary', () => {
  it('preserves unfinished state without trusting owner/date flags', () => {
    const document = worksheetEditorDocument(draft, selection);
    expect(document.assignment.schoolYear).toBe('2034-2035');
    expect(document.questions[0]).toMatchObject({ id: 'q', groupId: 'g', type: null, points: null });
    expect(document.groups[0].directions).toBe('Keep this direction');
    expect(document.teacherId).toBeUndefined(); expect(document.assignmentVerified).toBeUndefined();
  });
  it('unassigned means unassigned', () => { expect(worksheetEditorDocument(draft, null).assignment).toBeNull(); });
  it('production port never calls network or reports durable Save', async () => {
    const network = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('Network prohibited'); });
    try {
      expect(await editorPersistence.saveWorksheet({ draft, selection, requestId: 'r' })).toMatchObject({ ok: false, durable: false, code: 'integration_blocked' });
      expect(network).not.toHaveBeenCalled();
    } finally { network.mockRestore(); }
  });
  it('rejects synthetic success and preserves ambiguous outcome', async () => {
    expect(await createEditorPersistence(async () => ({ ok: true, durable: false })).reopenWorksheet('x')).toMatchObject({ ok: false });
    expect(await createEditorPersistence(async () => { throw new Error('offline'); }).reopenWorksheet('x')).toMatchObject({ code: 'outcome_unknown' });
  });
  it('same-ID retries retain operation/revision/request', async () => {
    const invoke = vi.fn(async () => ({ ok: true, durable: true, record: { id: 'existing' } }));
    const port = createEditorPersistence(invoke);
    const input = { draft, selection, id: 'existing', expectedRevision: 4, requestId: 'stable-request' };
    await port.saveWorksheet(input); await port.saveWorksheet(input);
    expect(invoke.mock.calls[0]).toEqual(invoke.mock.calls[1]);
    expect(invoke.mock.calls[0][0]).toBe('UpdatePrivateWorksheetDraft');
    expect(invoke.mock.calls[0][1]).toMatchObject({ id: 'existing', expectedRevision: 4, requestId: 'stable-request' });
  });
  it('Manual mapping preserves V2 content without forged owner', () => {
    const input = { teacherId: 'forged', document: createBlankIlawDocument(), sourceDetails: { classDuration: '', teachingStrategy: '', learningObjectives: '' } };
    const value = manualEditorDocument(input, selection);
    expect(value.document).toEqual(input.document); expect(value.kind).toBe('eduscribe.manual-ilaw');
    expect(value.teacherId).toBeUndefined(); expect(value.version).toBe(2);
  });
});
