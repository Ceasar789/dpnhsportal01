// T1: the converted choices use the kit toggle and keep no radio of their
// own; the student's quiz answers stay plain radio groups (not converted).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = rel => readFileSync([`src/${rel}`, `frontend/src/${rel}`].find(existsSync), 'utf8').replace(/\r\n/g, '\n');
const CONVERTED = {
  'pages/dashboards/teacher/worksheets/CreateTaskModal.jsx': '<ToggleChoice legend="Checking" name="create-task-checking"',
  'pages/dashboards/student/submissions/YourWorkPanel.jsx': "<ToggleChoice legend={editing ? 'Replace with' : 'Add your work as'} name={id('kind')}",
};

// U-PDF-T: Distribute's Checking mode is now one "AI checking" switch (role="switch"), not a
// two-way choice, so it left this list; it keeps no radio of its own.
it('U-PDF-T: Distribute has the AI checking switch and no radio', () => {
  const text = read('pages/dashboards/teacher/worksheets/DistributeModal.jsx');
  expect(text).toContain("role=\"switch\" aria-checked={checkingMode === 'auto'}");
  expect(text).not.toContain('type="radio"');
});

describe('T1: converted choices use ToggleChoice', () => {
  for (const [file, use] of Object.entries(CONVERTED)) {
    it(file, () => {
      const text = read(file);
      expect(text).toMatch(/import ToggleChoice from '(\.\.\/)+components\/ui\/form\/ToggleChoice';/);
      expect(text).toContain(use);
      expect(text).not.toContain('type="radio"');
    });
  }

  it('the student quiz answers are still native radio groups', () => {
    const tasks = read('pages/dashboards/student/tabs/TasksTab.jsx');
    expect(tasks.split('role="radiogroup" aria-labelledby={`question-${it.id}`}').length - 1).toBe(2);
    expect(tasks.split('<input type="radio" name={it.id}').length - 1).toBe(2);
    expect(tasks).not.toContain('ToggleChoice');
  });
});

// T1-3: Learning Materials uses the same toggle; its link field is "Link address".
describe('T1-3: Learning Materials uses ToggleChoice', () => {
  it('components/clarity/teacher/materials/MaterialFormModal.jsx', () => {
    const text = read('components/clarity/teacher/materials/MaterialFormModal.jsx');
    expect(text).toMatch(/import ToggleChoice from '(\.\.\/)+ui\/form\/ToggleChoice';/);
    expect(text).toContain('<ToggleChoice legend="Material type" name="material-kind"');
    expect(text).not.toContain('aria-pressed');
    expect(text).toContain('htmlFor={ids.url}>Link address</label>');
  });
});
