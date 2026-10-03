// Phase 7B — a calendar event records who created it.
//
// calendar_events.created_by has existed in both schema files all along
// and the app never wrote it, so every event in the system is anonymous.
// news records author_id and memos record sender_id; this was the one
// that did not.
//
// The second test is the one that matters most and needs no write: the
// five events already in the database all have a null created_by, and
// they must keep rendering. A fix that writes the column but breaks
// every row that predates it is not a fix.
import { test, expect } from '@playwright/test';
import {
  ADMIN_SKIP_REASON, WRITE_SKIP_REASON, allowWrites,
  hasAdminCredentials, loginAsAdmin, openAdminTab,
} from './helpers.js';

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;

async function adminToken(request) {
  const res = await request.post(`${URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    data: { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD },
  });
  expect(res.ok(), `could not sign in: ${res.status()}`).toBe(true);
  return (await res.json()).access_token;
}

test.describe('a calendar event knows who made it', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test('events that predate the column still load and render', async ({ page, request }) => {
    const token = await adminToken(request);
    const res = await request.get(
      `${URL}/rest/v1/calendar_events?select=id,title,created_by&limit=50`,
      { headers: { apikey: ANON, Authorization: `Bearer ${token}` } },
    );
    expect(res.ok(), `reading events failed: ${res.status()}`).toBe(true);
    const rows = await res.json();
    expect(rows.length, 'no events to check').toBeGreaterThan(0);

    const anonymous = rows.filter((r) => r.created_by === null);
    // Not an assertion about how many: just a note in the report of how
    // much of the history predates 7B.
    console.log(`events: ${rows.length}, of which created_by is null: ${anonymous.length}`);

    // The reader must not care. Every event still reaches the screen.
    await loginAsAdmin(page);
    await openAdminTab(page, 'Calendar');
    await expect(page.locator('.cal-grid')).toBeVisible();
    await expect(page.locator('.cal-event').first()).toBeVisible();

    // And opening one still works, which is where a bad join would show.
    await page.locator('.cal-event').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('a new event is attributed to the admin who created it', async ({ page, request }) => {
    test.skip(!allowWrites, WRITE_SKIP_REASON);
    test.setTimeout(120_000);

    const token = await adminToken(request);
    const title = `E2E author probe ${Date.now()}`;

    try {
      await loginAsAdmin(page);
      await openAdminTab(page, 'Calendar');
      await page.getByRole('button', { name: /Add Event/ }).first().click();
      await expect(page.locator('.ux-modal').first()).toBeVisible();

      await page.locator('#calendar-event-title, [role=dialog] input').first().fill(title);
      await page.locator('[role=dialog] input[type=date]').first().fill('2026-10-15');
      await page.getByRole('button', { name: /^Add Event$/ }).last().click();
      await expect(page.locator('.ux-modal')).toHaveCount(0, { timeout: 15_000 });

      const res = await request.get(
        `${URL}/rest/v1/calendar_events?select=id,title,created_by&title=eq.${encodeURIComponent(title)}`,
        { headers: { apikey: ANON, Authorization: `Bearer ${token}` } },
      );
      const rows = await res.json();
      expect(rows.length, 'the event was not created').toBe(1);
      expect(rows[0].created_by, 'the event was saved with no author').toBeTruthy();
    } finally {
      // Unlike an audit row, a calendar event can and should be removed:
      // it would otherwise show up on the school's real October.
      const del = await request.delete(
        `${URL}/rest/v1/calendar_events?title=eq.${encodeURIComponent(title)}`,
        { headers: { apikey: ANON, Authorization: `Bearer ${token}` } },
      );
      expect(del.ok(), `the probe event could not be removed: ${del.status()}`).toBe(true);
      const left = await request.get(
        `${URL}/rest/v1/calendar_events?select=id&title=eq.${encodeURIComponent(title)}`,
        { headers: { apikey: ANON, Authorization: `Bearer ${token}` } },
      );
      expect((await left.json()).length, 'the probe event is still there').toBe(0);
    }
  });
});
