import { test, expect } from '@playwright/test';
import { appReady, loginAsStudent, openAdminTab } from './helpers.js';

const WIDTHS = [360, 390, 768, 1024, 1440];

const teachers = [
  { id: 'teacher-ana', name: 'Ana Cruz', email: 'ana@example.com', department: 'English', status: 'active' },
  { id: 'teacher-ramon', name: 'Ramon Delgado', email: 'ramon@example.com', department: 'Mathematics', status: 'active' },
  { id: 'teacher-maria', name: 'Maria Santos With A Long Display Name', email: 'maria@example.com', department: 'Science and Technology', status: 'active' },
];

const subjects = [
  { id: 'subject-math', name: 'Mathematics', code: 'MATH', is_active: true },
  { id: 'subject-english', name: 'English', code: 'ENG', is_active: true },
  { id: 'subject-science', name: 'Science', code: 'SCI', is_active: true },
  { id: 'subject-ict', name: 'Information and Communications Technology', code: 'ICT', is_active: true },
];

async function openReadOnlyTeachingLoad(page) {
  await loginAsStudent(page);

  let nextId = 10;
  let rows = [
    { id: 'load-1', teacher_id: 'teacher-ana', subject_id: 'subject-english', grade_level: 'Grade 7', school_year: '2026-2027' },
    { id: 'load-2', teacher_id: 'teacher-ana', subject_id: 'subject-science', grade_level: 'Grade 7', school_year: '2026-2027' },
    { id: 'load-3', teacher_id: 'teacher-ramon', subject_id: 'subject-math', grade_level: 'Grade 7', school_year: '2026-2027' },
    { id: 'load-4', teacher_id: 'teacher-ana', subject_id: 'subject-math', grade_level: 'Grade 8', school_year: '2026-2027' },
  ];

  await page.route('**/rest/v1/profiles**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.searchParams.get('role') === 'eq.teacher') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(teachers) });
      return;
    }
    if (request.method() !== 'GET') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    const response = await route.fetch();
    const text = await response.text();
    if (!text) {
      await route.fulfill({ response });
      return;
    }
    const body = JSON.parse(text);
    const asAdmin = profile => ({ ...profile, role: 'main_admin', status: 'active' });
    await route.fulfill({ response, json: Array.isArray(body) ? body.map(asAdmin) : asAdmin(body) });
  });

  await page.route('**/rest/v1/subjects**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(subjects) });
  });

  await page.route('**/rest/v1/teacher_subjects**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
      return;
    }
    if (request.method() === 'POST') {
      const additions = request.postDataJSON();
      const inserted = additions.map(addition => ({ ...addition, id: `load-${nextId++}` }));
      rows = [...rows, ...inserted];
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(inserted.map(row => ({ id: row.id }))),
      });
      return;
    }
    if (request.method() === 'DELETE') {
      const idFilter = new URL(request.url()).searchParams.get('id');
      const ids = idFilter?.startsWith('in.')
        ? idFilter.slice(4, -1).split(',')
        : [idFilter?.replace(/^eq\./, '')];
      rows = rows.filter(row => !ids.includes(row.id));
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ status: 405, body: '' });
  });

  await page.goto('/admin-dashboard');
  await page.waitForURL('**/admin-dashboard**', { timeout: 30_000 });
  await appReady(page);
  await openAdminTab(page, 'Teaching Load');
  await expect(page.getByText('Select a teacher to begin assigning subjects.')).toBeVisible();
}

async function verifyLayout(page, width, theme) {
  await page.setViewportSize({ width, height: 900 });
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
  if (width < 1024) {
    await expect.poll(() => page.locator('#admin-sidebar').evaluate(element =>
      Math.round(element.getBoundingClientRect().right))).toBeLessThanOrEqual(0);
  }

  const layout = await page.evaluate(() => {
    const workspace = document.querySelector('.teaching-workspace');
    return {
      columns: getComputedStyle(workspace).gridTemplateColumns.split(' ').length,
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      workspaceOverflow: workspace.scrollWidth - workspace.clientWidth,
      overflowing: [...workspace.querySelectorAll('*')]
        .filter(element => element.offsetParent !== null && element.scrollWidth > element.clientWidth + 1
          && getComputedStyle(element).overflowX === 'visible').length,
    };
  });

  expect(layout.columns, `${theme} ${width}: workspace columns`).toBe(width < 1200 ? 1 : 2);
  expect(layout.pageOverflow, `${theme} ${width}: page overflow`).toBeLessThanOrEqual(0);
  expect(layout.workspaceOverflow, `${theme} ${width}: workspace overflow`).toBeLessThanOrEqual(0);
  expect(layout.overflowing, `${theme} ${width}: unclipped child overflow`).toBe(0);

  if (width < 1024) {
    for (const control of [
      page.getByRole('button', { name: /^Grade 7/ }),
      page.getByRole('button', { name: /Remove English from Ana Cruz/ }),
      page.getByRole('button', { name: 'Add Subject' }),
    ]) {
      const box = await control.boundingBox();
      expect(box.height, `${theme} ${width}: touch target height`).toBeGreaterThanOrEqual(44);
    }
  }
}

async function verifySearchFocus(page, theme) {
  const search = page.getByLabel('Search teachers');
  await page.getByRole('button', { name: /^Grade 12/ }).focus();
  await page.keyboard.press('Tab');
  await expect(search, `${theme}: search receives keyboard focus`).toBeFocused();

  await expect.poll(() => search.evaluate((input) => {
    const wrapper = input.closest('.picker-search');
    const inputStyle = getComputedStyle(input);
    const wrapperStyle = getComputedStyle(wrapper);
    return inputStyle.outlineStyle === 'none'
      && wrapperStyle.boxShadow !== 'none'
      && wrapperStyle.boxShadow.includes(wrapperStyle.borderColor)
      && wrapperStyle.boxShadow.endsWith('2px');
  }), { message: `${theme}: one settled wrapper ring and no nested input outline` }).toBe(true);
}

test('Teaching Load keeps the teacher central across assignment and responsive workflows', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('smartedu-theme', 'light'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReadOnlyTeachingLoad(page);

  const search = page.getByLabel('Search teachers');
  await search.fill('mathemat');
  await expect(page.locator('.teacher-option', { hasText: 'Ramon Delgado' })).toBeVisible();
  await expect(page.locator('.teacher-option', { hasText: 'Ana Cruz' })).toHaveCount(0);
  await search.fill('');

  const ana = page.locator('.teacher-option', { hasText: 'Ana Cruz' });
  await ana.focus();
  await page.keyboard.press('Enter');
  await expect(ana).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Ana Cruz' })).toBeVisible();
  await expect(page.getByText('Selected teacher')).toBeVisible();
  await expect(page.getByLabel(/Subjects assigned to Ana Cruz for Grade 7/)).toContainText('English');
  await expect(page.getByLabel(/Subjects assigned to Ana Cruz for Grade 7/)).toContainText('Science');
  await verifySearchFocus(page, 'light');

  for (const width of WIDTHS) await verifyLayout(page, width, 'light');
  await page.setViewportSize({ width: 360, height: 900 });
  await testInfo.attach('teaching-load-light-360', {
    body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
  });

  await page.getByRole('button', { name: 'Switch to Dark Mode' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await verifySearchFocus(page, 'dark');
  for (const width of WIDTHS) await verifyLayout(page, width, 'dark');
  await page.setViewportSize({ width: 1440, height: 900 });
  await testInfo.attach('teaching-load-dark-1440', {
    body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
  });

  const select = page.getByLabel('Add Subject');
  await select.selectOption('subject-math');
  await page.getByRole('button', { name: 'Add Subject' }).click();
  await select.selectOption('subject-ict');
  await page.getByRole('button', { name: 'Add Subject' }).click();
  await expect(page.getByText('2 changes across this teaching load')).toBeVisible();
  await expect(page.getByLabel('School Year')).toBeDisabled();
  await expect(page.getByText('Save or discard changes before changing the school year.')).toBeVisible();

  await select.selectOption('subject-english');
  await page.getByRole('button', { name: 'Add Subject' }).click();
  await expect(page.getByText('English is already assigned to Ana Cruz for Grade 7.')).toBeVisible();
  await expect(page.getByText('2 changes across this teaching load')).toBeVisible();

  const removeScience = page.getByRole('button', { name: /Remove Science from Ana Cruz/ });
  await removeScience.focus();
  await removeScience.click();
  await expect(page.getByText('3 changes across this teaching load')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains('subject-chip-remove'))).toBe(true);

  await page.getByRole('button', { name: 'Save Assignment' }).click();
  await expect(page.getByText('All changes saved')).toBeVisible();
  await expect(page.getByLabel('School Year')).toBeEnabled();
  const assigned = page.getByLabel(/Subjects assigned to Ana Cruz for Grade 7/);
  await expect(assigned).toContainText('English');
  await expect(assigned).toContainText('Mathematics');
  await expect(assigned).toContainText('Information and Communications Technology');
  await expect(assigned).not.toContainText('Science');

  await page.getByRole('button', { name: /^Grade 8/ }).click();
  await expect(page.getByRole('heading', { name: 'Ana Cruz' })).toBeVisible();
  await expect(page.getByLabel(/Subjects assigned to Ana Cruz for Grade 8/)).toContainText('Mathematics');
});
