// <Modal>, measured on the first tab migrated to it.
//
// The audit filed UX-098 against all eight admin overlays and UX-026 against
// seven. Every assertion here failed before this phase: the dialog had no
// role, took no focus, trapped none, returned none, ignored Escape, and
// threw away a half-filled form on any stray click.
//
// Also guards the thing Rule B2 put at risk. Taking `disabled` off the save
// button is what lets it keep focus while saving — and `disabled` was the
// only thing stopping a double click from creating two users.
import { test, expect } from '@playwright/test';
import { ADMIN_SKIP_REASON, hasAdminCredentials, loginAsAdmin, openAdminTab } from './helpers.js';

test.describe('admin user modal', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  const openCreate = async (page) => {
    await openAdminTab(page, 'User Management');
    await page.getByRole('button', { name: /add user|create user|new user/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
  };

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.waitForLoadState('networkidle');
  });

  test('it is a dialog, and it says what it is', async ({ page }) => {
    await openCreate(page);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    // aria-labelledby has to resolve to the visible title, not just exist.
    await expect(dialog).toHaveAccessibleName(/create user/i);
  });

  test('focus moves into the dialog and comes back out', async ({ page }) => {
    await openAdminTab(page, 'User Management');
    const trigger = page.getByRole('button', { name: /add user|create user|new user/i }).first();
    await trigger.click();

    const inside = await page.evaluate(() =>
      Boolean(document.querySelector('[role=dialog]')?.contains(document.activeElement)));
    expect(inside, 'focus stayed behind the overlay').toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Back on the control that opened it, not dumped on the body.
    const returned = await trigger.evaluate((el) => el === document.activeElement);
    expect(returned, 'focus did not return to the invoking control').toBe(true);
  });

  test('Tab cycles inside the dialog instead of walking out', async ({ page }) => {
    await openCreate(page);
    // Far more presses than the dialog has controls: if the trap leaks,
    // focus lands on the page behind and this fails.
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() =>
        Boolean(document.querySelector('[role=dialog]')?.contains(document.activeElement)));
      expect(inside, `focus escaped the dialog after ${i + 1} tabs`).toBe(true);
    }
    await page.keyboard.press('Escape');
  });

  test('an untouched form closes without nagging', async ({ page }) => {
    await openCreate(page);
    let asked = false;
    page.on('dialog', (d) => { asked = true; d.dismiss(); });
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(asked, 'an empty form should not ask to discard anything').toBe(false);
  });

  for (const [label, close] of [
    ['Escape', async (page) => page.keyboard.press('Escape')],
    ['Cancel', async (page) => page.getByRole('button', { name: 'Cancel' }).click()],
    ['the backdrop', async (page) => page.locator('.modal-overlay:has([role=dialog])').click({ position: { x: 5, y: 5 } })],
  ]) {
    test(`${label} asks before discarding a filled form`, async ({ page }) => {
      await openCreate(page);
      await page.locator('.form-input').first().fill('Typed something');

      // Decline the prompt: the dialog must still be there afterwards. The
      // same exit is then taken again and accepted.
      let prompts = 0;
      page.on('dialog', (d) => { prompts++; prompts === 1 ? d.dismiss() : d.accept(); });

      await close(page);
      expect(prompts, `${label} closed without asking`).toBe(1);
      await expect(page.getByRole('dialog'), `${label} discarded the form anyway`).toBeVisible();

      await close(page);
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
  }

  // Rule B2 / decision 9.
  test('a double click on Create saves once, not twice', async ({ page }) => {
    // The first version of this test left the form empty, so saveUser bailed
    // at its validation line — which sits ABOVE the ref guard — and the test
    // passed without the guard ever running. The form has to be valid for
    // this to mean anything.
    //
    // Valid, but the request never leaves: POST /auth/v1/signup is
    // intercepted, counted and failed after a delay long enough that both
    // clicks land while the first is still in flight. Nothing is created,
    // which keeps the suite read-only.
    let attempts = 0;
    await page.route('**/auth/v1/signup*', async (route) => {
      attempts += 1;
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'intercepted by the e2e suite — no user was created' }),
      });
    });

    await openCreate(page);
    const unique = `e2e-double-${Date.now()}@example.com`;
    await page.getByRole('dialog').locator('.form-input').nth(0).fill('E2E Double Click');
    await page.getByRole('dialog').locator('.form-input').nth(1).fill(unique);
    // Password is the last field on the create form.
    await page.getByRole('dialog').locator('input[type="password"]').fill('Str0ng!Passw0rd#9');

    // Two clicks in ONE tick, dispatched on the element itself. Calling
    // Playwright's click() twice does not test a double click here: the
    // busy label changes to "Creating…", the locator stops matching, and
    // the second click waits for "Create" to come back — which happens
    // only after the first save has finished. That is two sequential
    // saves, and it is what the first version of this test measured.
    const save = page.getByRole('button', { name: /^Create$/ }).last();
    await save.evaluate((el) => { el.click(); el.click(); });

    await expect.poll(() => attempts, { timeout: 10_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(2500);

    expect(attempts, `a double click fired ${attempts} signup requests`).toBe(1);
  });
});

// Phase 1b — the other eight overlays, and the one rule that differs.
test.describe('every admin dialog', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.waitForLoadState('networkidle');
  });

  // tab label, the control that opens the dialog, the name it should carry
  const DIALOGS = [
    ['Subjects', /add subject/i, /add subject/i],
    ['Sections', /add section/i, /add section/i],
    ['News Management', /new post|add post/i, /new post/i],
    ['Memos', /compose|new memo/i, /compose memo/i],
    ['Calendar', /add event|new event/i, /add calendar event/i],
  ];

  for (const [tab, opener, name] of DIALOGS) {
    test(`${tab}: the dialog takes focus and Escape returns it`, async ({ page }) => {
      await openAdminTab(page, tab);
      const trigger = page.getByRole('button', { name: opener }).first();
      test.skip(await trigger.count() === 0, `no opener matching ${opener} on ${tab}`);
      await trigger.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute('aria-modal', 'true');
      await expect(dialog).toHaveAccessibleName(name);

      expect(await page.evaluate(() =>
        Boolean(document.querySelector('[role=dialog]')?.contains(document.activeElement))),
      `${tab}: focus stayed behind the overlay`).toBe(true);

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      expect(await trigger.evaluate((el) => el === document.activeElement),
        `${tab}: focus did not return to the opener`).toBe(true);
    });
  }

  // Condition 3. The destructive button must NOT be what the keyboard lands
  // on — a stray Enter on an archive confirmation is the whole point.
  test('the delete confirmation opens with focus on Cancel', async ({ page }) => {
    await openAdminTab(page, 'Subjects');
    const del = page.getByRole('button', { name: /^Delete / }).first();
    test.skip(await del.count() === 0, 'no subject to delete against');
    await del.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
    expect(focused, 'focus landed somewhere other than Cancel').toBe('Cancel');

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  // UX-106: the filled-danger look is a named variant now, not an inline
  // override invented at the call site.
  test('the destructive confirm button uses the named variant', async ({ page }) => {
    await openAdminTab(page, 'Subjects');
    const del = page.getByRole('button', { name: /^Delete / }).first();
    test.skip(await del.count() === 0, 'no subject to delete against');
    await del.click();

    const confirm = page.getByRole('dialog').getByRole('button', { name: /yes,|delete/i }).first();
    await expect(confirm).toHaveClass(/btn-danger-solid/);
    const inline = await confirm.evaluate((el) => el.getAttribute('style') || '');
    expect(inline, 'the call site is still overriding colours inline').not.toMatch(/background/);

    await page.keyboard.press('Escape');
  });
});
