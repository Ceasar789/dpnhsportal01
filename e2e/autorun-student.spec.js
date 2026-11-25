// Phase 5: student flows of this run (4j audience, 4m soft errors, 4s views + Unread) in a real browser,
// against the production build and isolated mocks. Run: npx playwright test --config playwright.autorun.config.js
import { test, expect } from '@playwright/test';
import { installProfileMocks } from './profile-mock-fixture.js';
import { installSubmissionMocks } from './task-submissions-mock-fixture.js';

const NEWS = [
  { id: 'n-all', title: 'School-wide notice', content: 'For everyone.', status: 'Published', target_roles: 'all', priority: 'Normal', created_at: '2026-11-20T08:00:00Z', expires_at: null },
  { id: 'n-stu', title: 'Quiz week for students', content: 'Students only.', status: 'Published', target_roles: 'student', priority: 'High', created_at: '2026-11-19T08:00:00Z', expires_at: null },
  { id: 'n-tea', title: 'Faculty meeting memo', content: 'Teachers only.', status: 'Published', target_roles: 'teacher', priority: 'Normal', created_at: '2026-11-18T08:00:00Z', expires_at: null },
];
const routeNews = async (page, rows = NEWS) => {
  const seen = [];
  await page.route('**/rest/v1/news*', async (route) => {
    seen.push(new URL(route.request().url()).search);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
  });
  return seen;
};
const noSideways = async (page) => {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, 'no horizontal overflow').toBeLessThanOrEqual(client);
};

test.describe('student announcements (4j, 4s)', () => {
  test('teacher-only posts never show; All / Unread with Mark as read that survives a reload', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'student' });
    await routeNews(page);
    await page.goto('/student-dashboard/announcements');
    await expect(page.getByText('School-wide notice')).toBeVisible();
    await expect(page.getByText('Quiz week for students')).toBeVisible();
    await expect(page.getByText('Faculty meeting memo')).toHaveCount(0);
    const group = page.getByRole('group', { name: 'Show announcements' });
    await expect(group.getByRole('button', { name: 'Unread (2)' })).toBeVisible();
    await page.getByRole('button', { name: 'Mark School-wide notice as read' }).click();
    await expect(group.getByRole('button', { name: 'Unread (1)' })).toBeVisible();
    await group.getByRole('button', { name: 'Unread (1)' }).click();
    await expect(page.getByText('School-wide notice')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('group', { name: 'Show announcements' }).getByRole('button', { name: 'Unread (1)' })).toBeVisible();
    harness.assertHealthy();
  });

  test('a failed read shows the error card once, with Retry', async ({ page }) => {
    await installProfileMocks(page, { role: 'student' });
    await page.route('**/rest/v1/news*', route => route.fulfill({ status: 403, contentType: 'application/json',
      body: JSON.stringify({ code: '42501', message: 'permission denied for table news' }) }));
    await page.goto('/student-dashboard/announcements');
    await expect(page.getByText('Could not load announcements.')).toBeVisible();
    await expect(page.getByText('Error fetching announcements')).toHaveCount(0);
    await expect(page.getByText('permission denied for table news')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });
});

test.describe('student Tasks views (4s)', () => {
  test('All / Pending / Submitted / Graded with counts; an old ?view= link opens Pending', async ({ page }) => {
    await installProfileMocks(page, { role: 'student' });
    await installSubmissionMocks(page, { scenario: 'turnedIn' });
    await page.goto('/student-dashboard/tasks');
    const chips = page.getByRole('group', { name: 'Filter tasks' });
    await expect(chips.getByRole('button', { name: /^All \(/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(chips.getByRole('button', { name: /^Submitted \(1\)/ })).toBeVisible();
    await chips.getByRole('button', { name: /^Submitted/ }).click();
    await expect(page.getByText('Water cycle poster')).toBeVisible();
    await expect(page).toHaveURL(/view=submitted/);
    await page.goto('/student-dashboard/tasks?view=todo');
    await expect(page.getByRole('group', { name: 'Filter tasks' }).getByRole('button', { name: /^Pending/ })).toHaveAttribute('aria-pressed', 'true');
  });

  for (const width of [320, 390]) {
    test(`no sideways scroll and 44 px chips at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await installProfileMocks(page, { role: 'student' });
      await installSubmissionMocks(page, { scenario: 'none' });
      await page.goto('/student-dashboard/tasks');
      await expect(page.getByRole('group', { name: 'Filter tasks' })).toBeVisible();
      await noSideways(page);
      for (const box of await page.getByRole('group', { name: 'Filter tasks' }).getByRole('button').evaluateAll(els => els.map(e => e.getBoundingClientRect().height))) {
        expect(Math.round(box)).toBeGreaterThanOrEqual(44); // subpixel layout can report 43.99998
      }
    });
  }
});
