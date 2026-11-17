// U5 source pins: raw error text never reaches the page, Profile autocomplete,
// student answer fields labelled by their question, one attendance error (no toast).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = rel => readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), 'utf8');

describe('U5: the raw error sites use friendlyError / appErrorMessage', () => {
  const RAW = [
    /\+ ?error\.message/, /\+ ?err\.message/, /\$\{error\.message\}/, /\(error\?\.message \|\|/,
    /setError\(failure\?\.message/, /setMessage\(error\.message\)/, /setError\(cause\.message/, /showToast\(error\.message/,
    /setError\(err\.message\)/, /failure instanceof Error \? failure\.message/,
  ];
  it.each([
    ['pages/dashboards/teacher/tabs/WorksheetsTab.jsx', 'friendlyError(', 5],
    ['pages/dashboards/teacher/worksheets/useWorksheetAssessment.jsx', 'friendlyError(', 1],
    ['hooks/useSupabaseQuery.js', 'friendlyError(', 1],
    ['pages/dashboards/teacher/dayTasks/GenerateDayTaskModal.jsx', 'appErrorMessage(', 2],
    ['pages/dashboards/teacher/ilaw/FullManualIlawEditor.jsx', 'appErrorMessage(', 1],
    ['pages/dashboards/teacher/worksheets/EssayReviewLab.jsx', 'appErrorMessage(', 1],
    ['pages/dashboards/teacher/worksheets/LocalDistributionModal.jsx', 'appErrorMessage(', 2],
  ])('%s', (file, helper, count) => {
    const text = src(file);
    for (const pattern of RAW) expect(text).not.toMatch(pattern);
    expect(text.split(helper).length - 1).toBe(count);
  });

  it('LessonPlansTab: save, print and delete never show the raw message', () => {
    const text = src('pages/dashboards/teacher/tabs/LessonPlansTab.jsx');
    expect(text).not.toMatch(/'Could not save the lesson plan\. Your edits are still here\. ' \+ err\.message/);
    expect(text).not.toMatch(/'Error saving: ' \+ err\.message/);
    expect(text).not.toMatch(/catch\(error => showToast\(error\.message/);
    expect(text).not.toMatch(/showToast\('Error: ' \+ error\.message/);
    expect(text).toContain("appErrorMessage(err, 'The lesson plan could not be saved. Please try again.')");
    expect(text).toContain("appErrorMessage(error, 'The lesson plan could not be printed. Please try again.')");
    expect(text).toContain("friendlyError(error, { fallback: 'The lesson plan could not be deleted. Please try again.' })");
  });

  it('components/ilaw is left alone (U5 scope)', () => {
    expect(src('components/ilaw/hooks/useAIGeneration.js')).not.toContain('appErrorMessage');
  });
});

describe('U5: Profile fields tell the browser what they hold', () => {
  it.each([
    ['pages/profile/ProfileTab.jsx', [['profile-full-name', 'name'], ['profile-phone', 'tel'], ['profile-date-of-birth', 'bday'], ['profile-address', 'street-address']]],
    ['components/clarity/student/ClarityStudentProfileTab.jsx', [['profile-full-name', 'name'], ['profile-phone', 'tel'], ['profile-date-of-birth', 'bday'],
      ['profile-email', 'email'], ['profile-address', 'street-address'], ['profile-emergency-name', 'off'], ['profile-emergency-phone', 'off']]],
  ])('%s', (file, pairs) => {
    const text = src(file);
    for (const [id, token] of pairs) expect(text).toContain(`<input id="${id}" autoComplete="${token}"`);
  });
});

describe('U5: student answer fields are labelled by their question', () => {
  const text = src('pages/dashboards/student/tabs/TasksTab.jsx');
  it('the question text has an id, and every answer control or radio group points to it', () => {
    expect(text).toContain('<p id={`question-${it.id}`}');
    expect(text.split('aria-labelledby={`question-${it.id}`}').length - 1).toBe(5);
    expect(text.split('role="radiogroup" aria-labelledby={`question-${it.id}`}').length - 1).toBe(2);
  });
  it('typed answers read at 16px and are 44px tall at every size (landscape phones too), with a visible focus ring', () => {
    expect(text).not.toMatch(/rounded-lg text-sm outline-none/);
    expect(text.split('rounded-lg text-base focus-visible:outline').length - 1).toBe(3);
    expect(text).not.toMatch(/sm:min-h-9|sm:text-sm focus-visible/);
    expect(text).toContain('w-full min-h-11 px-3 rounded-lg text-base');
  });
});

describe('U5: one attendance save error (on the page, no second toast)', () => {
  it.each(['pages/dashboards/teacher/tabs/AttendanceTab.jsx', 'components/clarity/teacher/ClarityTeacherAttendanceTab.jsx'])('%s', (file) => {
    const text = src(file);
    expect(text).not.toContain("showToast(result.message, 'error');");
    expect(text).toContain('setSaveError(result.message);\n      // The message shows on the page (saveError): no second toast (U5).'.replace(/\n/g, text.includes('\r\n') ? '\r\n' : '\n'));
  });
});
