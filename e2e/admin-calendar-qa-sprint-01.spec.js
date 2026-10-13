import { test, expect } from '@playwright/test';
import { appReady, loginAsStudent, openAdminTab } from './helpers.js';

const WIDTHS = [360, 390, 768, 1024, 1440];

const initialEvents = () => [
  { id: 'event-past', title: 'Past Event', event_date: '2026-10-07', end_date: '2026-10-08', event_type: 'Event', custom_event_type: null, description: '' },
  { id: 'event-ongoing', title: 'Ongoing Examinations', event_date: '2026-10-07', end_date: '2026-10-10', event_type: 'Event', custom_event_type: null, description: '' },
  { id: 'event-custom', title: 'Foundation Day', event_date: '2026-10-12', end_date: null, event_type: 'Other', custom_event_type: 'School Celebration', description: '' },
  { id: 'event-deadline', title: 'Grade Submission', event_date: '2026-10-14', end_date: null, event_type: 'Deadline', custom_event_type: null, description: '' },
  { id: 'event-holiday', title: 'School Holiday', event_date: '2026-10-15', end_date: null, event_type: 'Holiday', custom_event_type: null, description: '' },
  { id: 'event-later', title: 'Later Faculty Meeting', event_date: '2026-10-29', end_date: null, event_type: 'Event', custom_event_type: null, description: '' },
];

async function openInterceptedCalendar(page, options = {}) {
  await loginAsStudent(page);

  const state = {
    events: initialEvents(),
    failReads: Boolean(options.failReads),
    failDelete: false,
    calendarReads: 0,
    eventPosts: 0,
    activityPosts: 0,
  };

  await page.route('**/rest/v1/profiles**', async (route) => {
    const request = route.request();
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
    const asAdmin = profile => profile ? ({ ...profile, role: 'main_admin', status: 'active' }) : profile;
    await route.fulfill({ response, json: Array.isArray(body) ? body.map(asAdmin) : asAdmin(body) });
  });

  await page.route('**/rest/v1/calendar_events**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      state.calendarReads += 1;
      if (state.failReads) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Calendar unavailable' }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.events) });
      return;
    }
    if (request.method() === 'POST') {
      state.eventPosts += 1;
      await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      return;
    }
    if (request.method() === 'DELETE') {
      if (state.failDelete) {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Delete denied' }),
        });
        return;
      }
      const id = new URL(request.url()).searchParams.get('id')?.replace(/^eq\./, '');
      const deleted = state.events.filter(event => event.id === id);
      state.events = state.events.filter(event => event.id !== id);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(deleted.map(({ id: eventId }) => ({ id: eventId }))) });
      return;
    }
    await route.fulfill({ status: 405, body: '' });
  });

  await page.route('**/rest/v1/activity_logs**', async (route) => {
    if (route.request().method() === 'POST') {
      state.activityPosts += 1;
      await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/admin-dashboard');
  await page.waitForURL('**/admin-dashboard**', { timeout: 30_000 });
  await appReady(page);
  await openAdminTab(page, 'Calendar');
  await expect(page.getByText('Calendar Management')).toBeVisible();
  return state;
}

async function verifyCalendarLayout(page, width, theme) {
  await page.setViewportSize({ width, height: 900 });
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);

  const layout = await page.evaluate(() => ({
    pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    calendarOverflow: document.querySelector('.cal-page').scrollWidth
      - document.querySelector('.cal-page').clientWidth,
    gridDisplay: getComputedStyle(document.querySelector('.cal-grid')).display,
    agendaDisplay: getComputedStyle(document.querySelector('.cal-agenda')).display,
  }));

  expect(layout.pageOverflow, `${theme} ${width}: page overflow`).toBeLessThanOrEqual(1);
  expect(layout.calendarOverflow, `${theme} ${width}: Calendar overflow`).toBeLessThanOrEqual(1);
  expect(layout.gridDisplay, `${theme} ${width}: grid visibility`).toBe(width < 768 ? 'none' : 'grid');
  expect(layout.agendaDisplay, `${theme} ${width}: agenda visibility`).toBe(width < 768 ? 'block' : 'none');
}

test('Calendar QA fixes preserve the workflow and responsive layout', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('smartedu-theme', 'light'));
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await openInterceptedCalendar(page);

  await expect(page.locator('.upcoming-item', { hasText: 'Ongoing Examinations' })).toBeVisible();
  await expect(page.locator('.upcoming-item', { hasText: 'Past Event' })).toHaveCount(0);

  await page.getByLabel('Filter events by type').selectOption({ label: 'Custom Type' });
  await expect(page.locator('.cal-event')).toHaveCount(1);
  await expect(page.locator('.cal-agenda-item')).toHaveCount(1);
  await expect(page.locator('.upcoming-item')).toHaveCount(1);
  await expect(page.locator('.upcoming-item')).toContainText('Foundation Day');
  await page.getByLabel('Filter events by type').selectOption('');

  await page.getByRole('button', { name: '+ Add Event' }).click();
  let dialog = page.getByRole('dialog', { name: 'Add Calendar Event' });
  await dialog.getByLabel('Title').fill('Invalid range probe');
  await dialog.getByLabel('Start Date').fill('2026-10-20');
  await dialog.getByLabel('End Date (optional)').fill('2026-10-19');
  await dialog.getByRole('button', { name: 'Add Event' }).click();
  const endDate = dialog.getByLabel('End Date (optional)');
  await expect(endDate).toBeFocused();
  await expect(endDate).toHaveAttribute('aria-invalid', 'true');
  await expect(endDate).toHaveAttribute('aria-describedby', 'calendar-end-date-error');
  await expect(dialog.getByText('End Date cannot be earlier than Start Date.')).toBeVisible();
  expect(state.eventPosts).toBe(0);
  page.once('dialog', prompt => prompt.accept());
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);

  await page.locator('.cal-event', { hasText: 'Later Faculty Meeting' }).click();
  dialog = page.getByRole('dialog', { name: 'Edit Event' });
  await expect(dialog.getByRole('button', { name: 'Delete' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Delete Event?' });
  await expect(confirmation).toBeVisible();
  const readsBeforeFailedDelete = state.calendarReads;
  state.failDelete = true;
  await confirmation.getByRole('button', { name: 'Yes, Delete' }).click();
  await expect(confirmation).toBeVisible();
  await expect(page.getByText('Could not delete event: Delete denied')).toBeVisible();
  expect(state.activityPosts).toBe(0);
  expect(state.calendarReads).toBe(readsBeforeFailedDelete);
  expect(state.events.some(event => event.id === 'event-later')).toBe(true);

  await confirmation.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeVisible();
  state.failDelete = false;
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog', { name: 'Delete Event?' })
    .getByRole('button', { name: 'Yes, Delete' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Event deleted')).toBeVisible();
  expect(state.activityPosts).toBe(1);
  expect(state.events.some(event => event.id === 'event-later')).toBe(false);

  for (const width of WIDTHS) await verifyCalendarLayout(page, width, 'light');
  await page.setViewportSize({ width: 360, height: 900 });
  await testInfo.attach('calendar-qa-light-360', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

  await page.getByRole('button', { name: 'Switch to Dark Mode' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  for (const width of WIDTHS) await verifyCalendarLayout(page, width, 'dark');
  await page.setViewportSize({ width: 1440, height: 900 });
  await testInfo.attach('calendar-qa-dark-1440', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});

test('Calendar fetch failure remains visible and Retry reuses the existing fetch', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const state = await openInterceptedCalendar(page, { failReads: true });

  const error = page.locator('.cal-load-error');
  await expect(error).toBeVisible();
  state.failReads = false;
  await error.getByRole('button', { name: 'Retry' }).click();
  await expect(error).toHaveCount(0);
  await expect(page.locator('.cal-agenda-item', { hasText: 'Foundation Day' })).toBeVisible();
});
