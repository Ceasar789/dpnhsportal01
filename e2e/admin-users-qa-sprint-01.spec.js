import { test, expect } from '@playwright/test';
import { appReady, loginAsStudent, openAdminTab } from './helpers.js';

const WIDTHS = [360, 390, 768, 1024, 1440];

async function openInterceptedUsers(page, { failUserReads = false } = {}) {
  await loginAsStudent(page);
  const state = {
    currentId: null, failUserReads, failInvites: false, failProfilePatches: false,
    profilePatches: 0, invitations: 0, lastInviteBody: null,
  };
  const other = {
    id: 'users-qa-other', name: 'Other User', email: 'other.user@example.com',
    role: 'teacher', status: 'active', department: 'Science', created_at: '2026-01-02T00:00:00.000Z',
  };

  await page.route('**/rest/v1/profiles**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const id = url.searchParams.get('id')?.replace(/^eq\./, '');

    if (request.method() === 'GET' && id) {
      const response = await route.fetch();
      const body = await response.json();
      const makeAdmin = profile => profile ? ({
        ...profile, name: 'Current Administrator', role: 'main_admin', status: 'active',
      }) : profile;
      const amended = Array.isArray(body) ? body.map(makeAdmin) : makeAdmin(body);
      state.currentId = Array.isArray(amended) ? amended[0]?.id : amended?.id;
      await route.fulfill({ response, json: amended });
      return;
    }

    if (request.method() === 'GET') {
      if (state.failUserReads) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Users unavailable' }) });
        return;
      }
      const current = {
        id: state.currentId, name: 'Current Administrator', email: 'current.admin@example.com',
        role: 'main_admin', status: 'active', created_at: '2026-01-01T00:00:00.000Z',
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([current, other]) });
      return;
    }

    if (request.method() === 'PATCH') {
      state.profilePatches += 1;
      if (state.failProfilePatches) {
        await route.fulfill({
          status: 406,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'PGRST116', details: 'The result contains 0 rows', hint: null,
            message: 'JSON object requested, multiple (or no) rows returned',
          }),
        });
        return;
      }
      const patch = request.postDataJSON();
      if (id === other.id) Object.assign(other, patch);
      await route.fulfill({
        status: 200, contentType: 'application/vnd.pgrst.object+json',
        body: JSON.stringify(id === other.id ? other : { id, ...patch }),
      });
      return;
    }

    if (request.method() === 'POST') {
      state.profileCreates += 1;
      const submitted = request.postDataJSON();
      state.lastCreateBody = Array.isArray(submitted) ? submitted[0] : submitted;
      if (state.failProfileCreates) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Profile create denied' }) });
        return;
      }
      await route.fulfill({
        status: 201, contentType: 'application/vnd.pgrst.object+json',
        body: JSON.stringify(state.lastCreateBody),
      });
      return;
    }

    await route.fulfill({ status: 405, body: '' });
  });

  await page.route('**/api/admin/users**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const current = {
      id: state.currentId, name: 'Current Administrator', email: 'current.admin@example.com',
      role: 'main_admin', status: 'active', onboarding_status: 'active', created_at: '2026-01-01T00:00:00.000Z',
    };
    if (request.method() === 'GET') {
      if (state.failUserReads) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Users unavailable' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: [current, other] }) });
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/invite')) {
      state.invitations += 1;
      state.lastInviteBody = request.postDataJSON();
      if (state.failInvites) return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'The invitation could not be completed. No account was added.' }) });
      const invited = { id: `invited-${state.invitations}`, ...state.lastInviteBody, status: 'inactive', onboarding_status: 'invitation_pending', can_resend_invitation: true };
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ user: invited }) });
    }
    if (request.method() === 'PATCH' && url.pathname.endsWith('/archive-state')) {
      state.profilePatches += 1;
      if (state.failProfilePatches) return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'The account status could not be changed.' }) });
      const archived = request.postDataJSON().archived;
      other.status = archived ? 'archived' : 'active';
      other.onboarding_status = archived ? 'archived' : 'active';
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: other }) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  await page.route('**/rest/v1/activity_logs**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/rest/v1/notifications**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.goto('/admin-dashboard');
  await page.waitForURL('**/admin-dashboard**', { timeout: 30_000 });
  await appReady(page);
  await openAdminTab(page, 'User Management');
  await expect(page.locator('.page-title', { hasText: 'User Management' })).toBeVisible();
  return state;
}

test('Users QA workflow protects the current admin and completes archive restore', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await openInterceptedUsers(page);

  await page.getByRole('button', { name: 'Edit Current Administrator' }).click();
  await page.getByLabel('Role', { exact: true }).selectOption('student');
  await page.getByRole('dialog', { name: 'Edit User' }).getByRole('button', { name: 'Update' }).click();
  await expect(page.getByText('You cannot change your own administrator role or account status.')).toBeVisible();
  expect(state.profilePatches).toBe(0);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('dialog', { name: 'Edit User' }).getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Archive Current Administrator' }).click();
  await expect(page.getByText('You cannot archive your own administrator account.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Archive User?' })).toHaveCount(0);

  state.failProfilePatches = true;
  await page.getByRole('button', { name: 'Archive Other User' }).click();
  const archiveDialog = page.getByRole('dialog', { name: 'Archive User?' });
  await archiveDialog.getByRole('button', { name: 'Yes, Archive' }).click();
  await expect(archiveDialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archive Other User' })).toBeVisible();
  expect(state.profilePatches).toBe(1);

  state.failProfilePatches = false;
  await archiveDialog.getByRole('button', { name: 'Yes, Archive' }).click();
  await expect(page.getByRole('button', { name: 'Archive Other User' })).toHaveCount(0);
  expect(state.profilePatches).toBe(2);

  await page.getByRole('button', { name: 'View archive history' }).click();
  await page.getByRole('button', { name: 'Restore Other User' }).click();
  await page.getByRole('dialog', { name: 'Restore User?' }).getByRole('button', { name: 'Yes, Restore' }).click();
  await expect(page.getByRole('button', { name: 'Restore Other User' })).toHaveCount(0);
  expect(state.profilePatches).toBe(3);

  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => localStorage.setItem('smartedu-theme', value), theme);
    await page.reload();
    await appReady(page);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await openAdminTab(page, 'User Management');
      const row = page.locator('.table-card tbody tr').filter({ hasText: 'Other User' });
      await expect(row).toBeVisible();
      expect(await row.getAttribute('role'), `${theme} ${width}: interaction model`)
        .toBe(width <= 560 ? 'button' : null);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${theme} ${width}: overflow`)
        .toBeLessThanOrEqual(1);
    }
  }
});

test('Users load failure remains visible and Retry uses the existing fetch path', async ({ page }) => {
  const state = await openInterceptedUsers(page, { failUserReads: true });
  await expect(page.getByText('Unable to load users.')).toBeVisible();

  state.failUserReads = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('button', { name: 'Archive Other User' })).toBeVisible();
  await expect(page.getByText('Unable to load users.')).toHaveCount(0);
});

test('User creation sends an invitation and fails without adding local state', async ({ page }) => {
  const state = await openInterceptedUsers(page);
  state.failInvites = true;

  await page.getByRole('button', { name: /Create User/ }).click();
  let dialog = page.getByRole('dialog', { name: 'Create User' });
  await dialog.getByLabel('Full Name').fill('Failed Invitation User');
  await dialog.getByLabel('Email').fill('failed.invitation@example.com');
  await expect(dialog.getByLabel(/^Password/)).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Send Invitation' }).click();
  await expect(page.getByText(/invitation could not be completed/i)).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(page.getByText('Failed Invitation User', { exact: true })).toHaveCount(0);

  page.once('dialog', prompt => prompt.accept());
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  state.failInvites = false;

  await page.getByRole('button', { name: /Create User/ }).click();
  dialog = page.getByRole('dialog', { name: 'Create User' });
  await dialog.getByLabel('Full Name').fill('Invited User');
  await dialog.getByLabel('Email').fill('invited.user@example.com');
  await dialog.getByRole('button', { name: 'Send Invitation' }).click();

  await expect(dialog).toHaveCount(0);
  expect(state.lastInviteBody).toEqual({ name: 'Invited User', email: 'invited.user@example.com', role: 'student', department: null });
  await expect(page.getByText('Invited User', { exact: true })).toBeVisible();
  await expect(page.getByText('Invitation Pending')).toBeVisible();
});
