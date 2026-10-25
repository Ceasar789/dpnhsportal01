// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import FullManualIlawEditor from './FullManualIlawEditor';
import { createQuickCreateIlawDraft } from './quickCreateIlawDraft';
import { createTemporaryManualIlawDraft } from './fullManualIlawModel';

const fixtures = [
  { teacherId: 'a', teacherLabel: 'Alex Example', planId: 'plan-a', planLabel: 'Math draft',
    assignment: { subjectId: 'math', subjectName: 'Mathematics', gradeLevel: 'Grade 8' } },
  { teacherId: 'b', teacherLabel: 'Sam Example', planId: 'plan-b', planLabel: 'Science draft',
    assignment: { subjectId: 'science', subjectName: 'Science', gradeLevel: 'Grade 7' } },
];

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('isolated Full Manual ILAW editor', () => {
  it('MUX1 edits a blank manual document without treating metadata as a verified assignment', () => {
    function ControlledEditor() {
      const [draft, setDraft] = useState(() => createTemporaryManualIlawDraft('synthetic-teacher', { name: 'Synthetic Teacher' }));
      return <FullManualIlawEditor mode="active" manualDraft={draft} onManualDraftChange={setDraft} />;
    }
    render(<ControlledEditor />);
    expect(screen.getByRole('textbox', { name: 'Name of Lesson' }).value).toBe('');
    expect(screen.getByRole('textbox', { name: 'Class Duration (minutes per session)' }).value).toBe('');
    expect(screen.getByRole('textbox', { name: 'Prepared by name' }).value).toBe('Synthetic Teacher');
    expect(screen.getByRole('textbox', { name: 'Checked by name' }).value).toBe('REXES MARLON A. TEODORO');
    expect(screen.getByRole('textbox', { name: 'Checked by designation' }).value).toBe('TLE Coordinator');
    expect(screen.getByRole('textbox', { name: 'Noted by name' }).value).toBe('MARIA BEATRIZ T. MANAIG');
    expect(screen.getByRole('textbox', { name: 'Noted by designation' }).value).toBe('School Principal II');
    fireEvent.change(screen.getByRole('textbox', { name: 'Name of Lesson' }), { target: { value: 'Manual sample' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Teaching Date' }), { target: { value: '2026-10-16' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Learning Area/s' }), { target: { value: 'English' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Designed for which Grade Level and Section' }), { target: { value: 'Grade 7' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Class Duration (minutes per session)' }), { target: { value: '50 minutes' } });
    expect(screen.queryByRole('button', { name: 'Check required fields' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save Draft' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Preview document' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download PDF' })).toBeNull();
    expect(screen.getByText('About this local draft')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Save Plan|Post|Distribute/i })).toBeNull();
  });

  it('edits Quick Create source details and independent weekdays in the same ILAW template', () => {
    const initial = createQuickCreateIlawDraft({ teacher_id: 'a', subject_id: 'math', subject: 'Mathematics',
      grade_level: 'Grade 8', title: 'Cells', duration: '45 minutes', strategy: 'Custom group work',
      objectives: 'First objective\nSecond objective' }, '2026-2027');
    function ControlledEditor() {
      const [draft, setDraft] = useState(initial);
      return <FullManualIlawEditor mode="active" quickCreateDraft={draft} onQuickCreateDraftChange={setDraft} />;
    }
    render(<ControlledEditor />);
    expect(screen.getByRole('textbox', { name: 'Class Duration (minutes per session)' }).value).toBe('45 minutes');
    expect(screen.getByRole('textbox', { name: 'Teaching Strategy' }).value).toBe('Custom group work');
    expect(screen.getByRole('textbox', { name: 'Learning Objectives (lesson-wide)' }).value).toBe('First objective\nSecond objective');
    expect(screen.getByRole('textbox', { name: 'Learning Objectives, Monday' }).value).toBe('');
    fireEvent.change(screen.getByRole('textbox', { name: 'Learning Objectives, Monday' }), { target: { value: 'Monday only' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Learning Objectives, Tuesday' }), { target: { value: 'Tuesday only' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Teaching Strategy' }), { target: { value: 'Teacher revised strategy' } });
    expect(screen.getByRole('textbox', { name: 'Teaching Strategy' }).value).toBe('Teacher revised strategy');
    expect(screen.getByRole('textbox', { name: 'Learning Objectives, Monday' }).value).toBe('Monday only');
    expect(screen.getByRole('textbox', { name: 'Learning Objectives, Tuesday' }).value).toBe('Tuesday only');
    expect(screen.getByRole('textbox', { name: 'Learning Objectives (lesson-wide)' }).value).toBe('First objective\nSecond objective');
    expect(document.querySelectorAll('.ilaw-template table')).toHaveLength(5);
  });

  it('MI-12 previews the current structured draft without input fields', () => {
    render(<FullManualIlawEditor fixtures={fixtures} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name of Lesson' }), { target: { value: 'Synthetic fractions' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview document' }));
    expect(screen.getByText('Synthetic fractions')).toBeTruthy();
    expect(document.querySelectorAll('.ilaw-template input, .ilaw-template textarea')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Edit document' }));
    expect(screen.getByRole('textbox', { name: 'Name of Lesson' }).value).toBe('Synthetic fractions');
  });

  it('MI-06 shows required feedback and does not create a snapshot for an incomplete draft', () => {
    render(<FullManualIlawEditor fixtures={fixtures} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create mock snapshot' }));
    expect(screen.getByRole('alert').textContent).toContain('Name of Lesson is required');
    expect(screen.getByRole('textbox', { name: 'Versioned synthetic payload' }).value).toBe('');
  });

  it('MI-11 leaves active content intact when a corrupt payload is reopened', () => {
    render(<FullManualIlawEditor fixtures={fixtures} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name of Lesson' }), { target: { value: 'Keep my work' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Versioned synthetic payload' }), { target: { value: '{' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reopen mock payload' }));
    expect(screen.getByRole('textbox', { name: 'Name of Lesson' }).value).toBe('Keep my work');
    expect(screen.getByText(/This ILAW draft cannot be read/)).toBeTruthy();
  });

  it('MI-13 protects dirty fixture navigation with the shared confirmation dialog', () => {
    render(<FullManualIlawEditor fixtures={fixtures} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name of Lesson' }), { target: { value: 'Unsaved math' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Preview Teacher and plan' }), { target: { value: '1' } });
    const dialog = screen.getByRole('dialog', { name: 'Switch ILAW example' });
    expect(dialog.textContent).toContain('Discard unsaved changes to this synthetic ILAW draft?');
    expect(screen.getByRole('textbox', { name: 'Name of Lesson' }).value).toBe('Unsaved math');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Switch ILAW example' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Preview Teacher and plan' }).value).toBe('0');
    expect(screen.getByRole('textbox', { name: 'Name of Lesson' }).value).toBe('Unsaved math');
    fireEvent.change(screen.getByRole('combobox', { name: 'Preview Teacher and plan' }), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByRole('dialog', { name: 'Switch ILAW example' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Learning Area/s' }).value).toBe('Science');
    expect(screen.getByRole('textbox', { name: 'Name of Lesson' }).value).toBe('');
  });

  it('MI-14 keeps the synthetic Teacher and plan drafts separate', () => {
    render(<FullManualIlawEditor fixtures={fixtures} />);
    expect(screen.getByRole('textbox', { name: 'Learning Area/s' }).value).toBe('Mathematics');
    fireEvent.change(screen.getByRole('combobox', { name: 'Preview Teacher and plan' }), { target: { value: '1' } });
    expect(screen.getByRole('textbox', { name: 'Learning Area/s' }).value).toBe('Science');
    fireEvent.change(screen.getByRole('textbox', { name: 'Name of Lesson' }), { target: { value: 'Science only' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Preview Teacher and plan' }), { target: { value: '0' } });
    expect(screen.getByRole('dialog', { name: 'Switch ILAW example' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByRole('textbox', { name: 'Learning Area/s' }).value).toBe('Mathematics');
    expect(screen.getByRole('textbox', { name: 'Name of Lesson' }).value).toBe('');
  });

  it('MI-18 MI-19 has no post, distribution, Supabase, or network path', () => {
    const fetch = vi.fn(() => { throw new Error('External network forbidden'); });
    vi.stubGlobal('fetch', fetch);
    render(<FullManualIlawEditor fixtures={fixtures} />);
    expect(screen.queryByRole('button', { name: /post|distribute|upload/i })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Learning Objectives, Monday' }), { target: { value: 'Teacher input' } });
    expect(fetch).not.toHaveBeenCalled();
  });
});
