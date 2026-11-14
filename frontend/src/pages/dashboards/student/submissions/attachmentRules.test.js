// S3: the pure rules for file/link submissions, and the shared upload rules
// they use (lib/uploadRules.js, moved from the Learning Materials rules).
import { describe, expect, it } from 'vitest';
import {
  MATERIAL_TYPES, MAX_MATERIAL_BYTES, fileProblem, linkHost, mimeForFileName, safeLink,
} from '../../../../lib/uploadRules';
import * as materialRules from '../../../../components/clarity/teacher/materials/materialRules';
import * as uploadRules from '../../../../lib/uploadRules';
import {
  MESSAGES, NOTE_MAX, attachmentHeading, attachmentPath, attachmentStatus, cleanNote, isAttachmentRequired,
  isGradedRefusal, isStorageRefusal, noteProblem, panelState,
} from './attachmentRules';
import { GREEN, INFO, NEUTRAL, YELLOW } from '../badgeTones';

const file = (name, size = 10) => ({ name, size });
const UUID = '0b0b0b0b-1111-4222-8333-444444444444';

describe('the shared upload rules moved to lib/uploadRules.js', () => {
  it('Learning Materials re-exports the very same functions and values', () => {
    for (const name of ['MAX_MATERIAL_BYTES', 'LINK_MAX', 'FILE_NAME_MAX', 'MATERIAL_TYPES', 'MATERIAL_ACCEPT', 'MATERIAL_FILE_GUIDANCE',
      'extensionOf', 'mimeForFileName', 'formatBytes', 'fileProblem', 'safeLink', 'linkProblem', 'safeMaterialFileName', 'linkHost']) {
      expect(materialRules[name], name).toBe(uploadRules[name]);
    }
  });

  it.each(Object.entries({
    pdf: 'application/pdf', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', txt: 'text/plain',
  }))('.%s uploads as %s (from the extension, any case)', (ext, mime) => {
    expect(mimeForFileName(`work.${ext}`)).toBe(mime);
    expect(mimeForFileName(`WORK.${ext.toUpperCase()}`)).toBe(mime);
    expect(fileProblem(file(`work.${ext}`))).toBeNull();
  });

  it('exactly the 11 extensions of the bucket', () => {
    expect(Object.keys(MATERIAL_TYPES).sort()).toEqual(['doc', 'docx', 'jpeg', 'jpg', 'pdf', 'png', 'ppt', 'pptx', 'txt', 'xls', 'xlsx']);
  });

  it.each(['run.exe', 'page.html', 'pic.svg', 'notes', 'archive.zip', 'film.mp4', 'pdf'])('refuses %s', (name) => {
    expect(fileProblem(file(name))).toMatch(/not allowed/);
  });

  it('sizes: 0 B is empty, 20 MB is fine, one byte more is refused', () => {
    expect(fileProblem(file('a.pdf', 0))).toBe('This file is empty.');
    expect(fileProblem(file('a.pdf', MAX_MATERIAL_BYTES))).toBeNull();
    expect(fileProblem(file('a.pdf', MAX_MATERIAL_BYTES + 1))).toMatch(/The limit is 20 MB\.$/);
    expect(fileProblem(null)).toBe('Choose a file to upload.');
  });

  it('links: http and https only, no spaces, at most 2048 characters', () => {
    expect(safeLink('https://docs.example.org/x?y=1')).toBe('https://docs.example.org/x?y=1');
    expect(safeLink('  http://example.org  ')).toBe('http://example.org');
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.org/f', 'example.org', 'https://exa mple.org',
      'https://', '', `https://example.org/${'a'.repeat(2030)}`]) {
      expect(safeLink(bad), bad).toBeNull();
    }
    expect(linkHost('https://www.deped.gov.ph/a')).toBe('www.deped.gov.ph');
    expect(linkHost('javascript:alert(1)')).toBe('');
  });
});

describe('submission paths and notes', () => {
  it('<student id>/<task id>/<uuid>-<safe name>, matching the bucket and table check', () => {
    const path = attachmentPath(UUID, UUID, UUID, 'My essay (final) v2.docx');
    expect(path).toBe(`${UUID}/${UUID}/${UUID}-My-essay--final--v2.docx`);
    expect(path).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}-[A-Za-z0-9._-]{1,120}$/);
    expect(attachmentPath(UUID, UUID, UUID, '../../etc.pdf')).not.toMatch(/\.\./);
  });

  it('the note: at most 1,000 characters, trimmed, null when empty', () => {
    expect(NOTE_MAX).toBe(1000);
    expect(noteProblem('x'.repeat(1000))).toBeNull();
    expect(noteProblem('x'.repeat(1001))).toBe('Keep your note to 1,000 characters.');
    expect(cleanNote('  hi  ')).toBe('hi');
    expect(cleanNote('   ')).toBeNull();
    expect(cleanNote(undefined)).toBeNull();
  });
});

describe('panel states and badges', () => {
  it.each([
    [null, false, 'none', 'Assigned', NEUTRAL],
    [{ status: 'in_progress', released: false }, false, 'none', 'Assigned', NEUTRAL],
    [{ status: 'in_progress', released: false }, true, 'attached', 'Assigned', NEUTRAL],
    [{ status: 'submitted', released: false }, true, 'turnedIn', 'Turned in', YELLOW],
    [{ status: 'checked', released: false }, true, 'graded', 'Graded', INFO],
    [{ status: 'checked', released: true }, true, 'returned', 'Returned', GREEN],
    [{ status: 'weird' }, false, 'none', 'Assigned', NEUTRAL],
  ])('%j with attachment %s is %s / %s', (submission, has, state, label, tone) => {
    expect(panelState(submission, has)).toBe(state);
    expect(attachmentStatus(submission)).toEqual({ label, tone });
  });

  it('the paper heading names the task type', () => {
    expect(attachmentHeading({ task_type: 'worksheet' })).toBe('ACTIVITY');
    expect(attachmentHeading({ task_type: 'assignment' })).toBe('ASSIGNMENT');
    expect(attachmentHeading({})).toBe('ACTIVITY');
  });
});

describe('error recognition (database text is matched, never shown)', () => {
  it('attachment_required from the guard', () => {
    expect(isAttachmentRequired({ message: 'attachment_required' })).toBe(true);
    expect(isAttachmentRequired({ message: 'other' })).toBe(false);
  });
  it('a graded row refused by the guard', () => {
    expect(isGradedRefusal({ message: 'Students may not move a submission from checked to in_progress' })).toBe(true);
    expect(isGradedRefusal({ message: 'Students may not score or release their own submission' })).toBe(true);
    expect(isGradedRefusal({ message: 'network' })).toBe(false);
  });
  it('a storage refusal (403 or RLS)', () => {
    expect(isStorageRefusal({ statusCode: '403', message: 'x' })).toBe(true);
    expect(isStorageRefusal({ message: 'new row violates row-level security policy' })).toBe(true);
    expect(isStorageRefusal({ message: 'Failed to fetch' })).toBe(false);
  });
  it('every message is plain text with no database words', () => {
    for (const text of Object.values(MESSAGES)) expect(text).not.toMatch(/row-level|policy|violates|sql|postgres|42501|23505/i);
  });
});
