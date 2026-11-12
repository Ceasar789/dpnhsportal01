// @vitest-environment jsdom
// Clarity A7: the Admin System Settings tab (final design, real settings only).
// Each control is checked against the classic tab on the same mocked
// context: the same setters with the same arguments, the same validation,
// the same save bar rules, the same theme options, the same states.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../../../pages/dashboards/admin/AdminContext', () => ({ useAdminContext: () => h.ctx }));

import SettingsTab from '../../../pages/dashboards/admin/tabs/SettingsTab';
import ClarityAdminSettingsTab from './ClarityAdminSettingsTab';

const SETTINGS = { academic_year: '2026-2027', semester: '2nd Quarter' };
const base = (over = {}) => ({
  activityLogs: [], backupHistory: [], saveSettings: vi.fn(), sessionTimeout: '30 min', setSessionTimeout: vi.fn(),
  setSettings: vi.fn(), settings: SETTINGS, settingsSaving: false,
  settingsDirty: false, settingsChangeCount: 0, discardSettings: vi.fn(), themePref: 'light', setThemePref: vi.fn(),
  settingsStatus: 'ready', settingsError: '', settingsValidation: { academicYear: '', quarter: '', sessionTimeout: '' },
  settingsAuthorized: true, settingsCanEdit: true, settingsCanSave: false, fetchSettings: vi.fn(),
  backupHistoryStatus: 'ready', backupHistoryError: '', fetchBackupHistory: vi.fn(), overviewLoading: false,
  activeSettingsSub: 'sec-general', scrollToSection: vi.fn(),
  ...over,
});
const TABS = { classic: SettingsTab, clarity: ClarityAdminSettingsTab };
const year = () => screen.getByLabelText(/^Academic year$/i);
const quarter = () => screen.getByLabelText(/^Quarter$/i);
const timeout = () => screen.getByLabelText('Session Timeout');
const saveButton = () => screen.queryByRole('button', { name: /^Save changes$/i });
const calls = () => Object.fromEntries(Object.entries(h.ctx).filter(([, v]) => v?.mock).map(([k, v]) => [k, v.mock.calls]));

const both = async (over, scenario) => {
  const out = {};
  for (const [key, Tab] of Object.entries(TABS)) {
    h.ctx = base(over);
    render(<Tab />);
    out[key] = await scenario(key);
    cleanup();
  }
  return out;
};

beforeEach(() => { h.ctx = base(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('layout from real settings', () => {
  it('header, the section list with the shell ids, and one card per section', () => {
    render(<ClarityAdminSettingsTab />);
    expect(screen.getByRole('heading', { level: 1, name: 'System Settings' })).toBeTruthy();
    expect(screen.getByText('Manage academic display, session behavior, appearance, and operational information')).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(within(nav).getAllByRole('button').map(b => b.textContent)).toEqual(['General', 'Security', 'Notifications', 'Backup & Logs', 'Appearance']);
    expect(within(nav).getByRole('button', { name: 'General' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getAllByRole('heading', { level: 2 }).map(h2 => [h2.textContent, h2.closest('section').id])).toEqual([
      ['General', 'sec-general'], ['Security', 'sec-security'], ['Notifications', 'sec-notifications'],
      ['Backup & logs', 'sec-backup'], ['Appearance', 'sec-appearance'],
    ]);
  });

  it('every classic control shows the context values', async () => {
    const r = await both({}, () => [year().value, quarter().value, timeout().value, screen.getByLabelText(/^Portal name$/i).value, screen.getByLabelText(/^Portal name$/i).disabled]);
    expect(r.clarity).toEqual(r.classic);
    expect(r.clarity).toEqual(['2026-2027', '2nd Quarter', '30 min', 'EduScribe Portal', true]);
  });

  it('the same options in Quarter and Session timeout', async () => {
    const r = await both({}, () => [[...quarter().options].map(o => o.textContent), [...timeout().options].map(o => o.textContent)]);
    expect(r.clarity).toEqual(r.classic);
  });

  it('the read-only rows say what the classic tab says, and there are no switches', () => {
    const { container } = render(<ClarityAdminSettingsTab />);
    for (const text of [
      'Users sign in with email and password. Password reset links are sent through Supabase Auth.',
      '5 attempts · 60 sec', 'Daily', 'English only',
      'Each downloadable backup artifact is retained for 7 days.',
      'Activity logs are kept indefinitely. No automated retention policy is implemented.',
    ]) expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByText(/The portal currently does not send announcement, memo, calendar, or activity email notifications/)).toBeTruthy();
    expect(container.querySelector('input[type="checkbox"], [role="switch"]')).toBeNull();
    expect(container.textContent).not.toMatch(/Email announcements|Memo alerts|30 days|90 days/);
  });

  it('no "preview" anywhere', () => {
    h.ctx = base({ settingsDirty: true, settingsChangeCount: 1 });
    const { container } = render(<ClarityAdminSettingsTab />);
    const attrs = [...container.querySelectorAll('[aria-label],[title],[alt]')].flatMap(el => ['aria-label', 'title', 'alt'].map(a => el.getAttribute(a) || ''));
    expect(`${container.textContent} ${attrs.join(' ')}`).not.toMatch(/preview/i);
  });
});

describe('every classic function, same calls (classic vs Clarity on the same context)', () => {
  it('Academic year, Quarter and Session timeout call the same setters with the same arguments', async () => {
    const r = await both({}, () => {
      fireEvent.change(year(), { target: { value: '2027-2028' } });
      fireEvent.change(quarter(), { target: { value: '3rd Quarter' } });
      fireEvent.change(timeout(), { target: { value: '1 hour' } });
      return calls();
    });
    expect(r.clarity).toEqual(r.classic);
    expect(r.clarity.setSettings).toEqual([[{ ...SETTINGS, academic_year: '2027-2028' }], [{ ...SETTINGS, semester: '3rd Quarter' }]]);
    expect(r.clarity.setSessionTimeout).toEqual([['1 hour']]);
  });

  it('Theme: the classic three options (Dark, Light, Auto), the same setThemePref values', async () => {
    const r = await both({ themePref: 'auto' }, (key) => {
      if (key === 'classic') {
        const select = screen.getByLabelText('Theme');
        const options = [...select.options].map(o => [o.value, o.textContent]);
        for (const [value] of options) fireEvent.change(select, { target: { value } });
        return { names: options.map(([, label]) => label), calls: h.ctx.setThemePref.mock.calls, current: select.value };
      }
      const group = screen.getByRole('group', { name: 'Theme' });
      const buttons = within(group).getAllByRole('button');
      buttons.forEach(b => fireEvent.click(b));
      return { names: buttons.map(b => b.getAttribute('aria-label')), calls: h.ctx.setThemePref.mock.calls, current: ['dark', 'light', 'auto'][buttons.findIndex(b => b.getAttribute('aria-pressed') === 'true')] };
    });
    expect(r.clarity).toEqual(r.classic);
    expect(r.clarity.calls).toEqual([['dark'], ['light'], ['auto']]);
    expect(r.clarity.current).toBe('auto');
  });

  it('the section list calls the same scrollToSection(id) the shell sub-nav uses; aria-current follows activeSettingsSub', () => {
    h.ctx = base({ activeSettingsSub: 'sec-backup' });
    render(<ClarityAdminSettingsTab />);
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(within(nav).getByRole('button', { name: 'Backup & Logs' }).getAttribute('aria-current')).toBe('true');
    within(nav).getAllByRole('button').forEach(b => fireEvent.click(b));
    expect(h.ctx.scrollToSection.mock.calls).toEqual([['sec-general'], ['sec-security'], ['sec-notifications'], ['sec-backup'], ['sec-appearance']]);
    for (const [name, fn] of Object.entries(h.ctx)) if (fn?.mock && name !== 'scrollToSection') expect(fn, name).not.toHaveBeenCalled();
  });

  it('every section stays mounted, so a section change cannot drop an edit', () => {
    h.ctx = base({ activeSettingsSub: 'sec-appearance', settingsDirty: true, settingsChangeCount: 1 });
    render(<ClarityAdminSettingsTab />);
    expect(year()).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Theme' })).toBeTruthy();
  });
});

describe('the save bar is the classic one', () => {
  it('hidden while clean', async () => {
    const r = await both({}, () => [saveButton(), screen.queryByRole('button', { name: 'Discard' })]);
    expect(r.clarity).toEqual([null, null]);
    expect(r.classic).toEqual([null, null]);
  });

  it.each([
    ['dirty and valid', { settingsDirty: true, settingsChangeCount: 2, settingsCanSave: true }],
    ['dirty and invalid', { settingsDirty: true, settingsChangeCount: 1, settingsCanSave: false }],
    ['saving', { settingsDirty: true, settingsChangeCount: 1, settingsCanSave: false, settingsSaving: true }],
    ['not authorized', { settingsDirty: true, settingsChangeCount: 1, settingsAuthorized: false }],
  ])('%s: the same count, the same enabled state, the same calls', async (_, over) => {
    const r = await both(over, () => {
      const bar = screen.getByText(/unsaved change/).closest('[role="status"]');
      const save = within(bar).getAllByRole('button').at(-1);
      const discard = within(bar).getByRole('button', { name: 'Discard' });
      const state = { count: screen.getByText(/unsaved change/).textContent, save: save.disabled, discard: discard.disabled, busy: save.getAttribute('aria-busy') };
      fireEvent.click(save);
      fireEvent.click(discard);
      return { ...state, saved: h.ctx.saveSettings.mock.calls.length, discarded: h.ctx.discardSettings.mock.calls.length };
    });
    expect(r.clarity).toEqual(r.classic);
  });

  it('the save button names: "Save changes" and, while saving, "Saving…"', () => {
    h.ctx = base({ settingsDirty: true, settingsChangeCount: 1, settingsCanSave: true });
    render(<ClarityAdminSettingsTab />);
    expect(saveButton()).toBeTruthy();
    cleanup();
    h.ctx = base({ settingsDirty: true, settingsChangeCount: 1, settingsSaving: true });
    render(<ClarityAdminSettingsTab />);
    expect(screen.getByRole('button', { name: 'Saving…' }).getAttribute('aria-busy')).toBe('true');
  });

  it('beforeunload is registered only while dirty', async () => {
    const r = await both({}, async () => {
      const add = vi.spyOn(window, 'addEventListener');
      const clean = add.mock.calls.some(([type]) => type === 'beforeunload');
      add.mockRestore();
      return clean;
    });
    expect(r).toEqual({ classic: false, clarity: false });
    const add = vi.spyOn(window, 'addEventListener');
    h.ctx = base({ settingsDirty: true, settingsChangeCount: 1 });
    render(<ClarityAdminSettingsTab />);
    await waitFor(() => expect(add.mock.calls.some(([type]) => type === 'beforeunload')).toBe(true));
  });
});

describe('validation and states (same texts and handlers as classic)', () => {
  it('academic-year validation: the same message and aria wiring', async () => {
    const message = 'The ending year must be exactly one year after the starting year.';
    const r = await both({ settings: { ...SETTINGS, academic_year: '2026-2028' }, settingsDirty: true, settingsChangeCount: 1, settingsValidation: { academicYear: message, quarter: '', sessionTimeout: '' } }, () => (
      [year().getAttribute('aria-invalid'), year().getAttribute('aria-describedby'), screen.getByText(message).id]));
    expect(r.clarity).toEqual(r.classic);
  });

  it('loading disables every persisted control', async () => {
    const r = await both({ settingsStatus: 'loading', settingsCanEdit: false }, () => (
      [Boolean(screen.getByText('Loading system settings…')), year().disabled, quarter().disabled, timeout().disabled, year().value, quarter().value, timeout().value]));
    expect(r.clarity).toEqual(r.classic);
    expect(r.clarity.slice(0, 4)).toEqual([true, true, true, true]);
  });

  it.each(['missing', 'error'])('%s: the alert with the context error and Retry (fetchSettings)', async (status) => {
    const r = await both({ settingsStatus: status, settingsCanEdit: false, settingsError: 'Synthetic unavailable state.' }, () => {
      const text = screen.getByRole('alert').textContent.includes('Synthetic unavailable state.');
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      return [text, h.ctx.fetchSettings.mock.calls.length, year().disabled];
    });
    expect(r.clarity).toEqual(r.classic);
    expect(r.clarity).toEqual([true, 1, true]);
  });

  it('not a Main Admin: the same notice', async () => {
    const r = await both({ settingsAuthorized: false, settingsCanEdit: false }, () => screen.getByRole('alert').textContent);
    expect(r.clarity).toBe(r.classic);
  });

  it('backup history: error with its own Retry, empty, and real rows with their statuses', async () => {
    const err = await both({ backupHistoryStatus: 'error', backupHistoryError: 'Synthetic backup failure.' }, () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry backup history' }));
      return [Boolean(screen.getByText('Synthetic backup failure.')), h.ctx.fetchBackupHistory.mock.calls.length, screen.queryByText('No backup runs have been recorded.')];
    });
    expect(err.clarity).toEqual(err.classic);
    const empty = await both({}, () => Boolean(screen.getByText('No backup runs have been recorded.')));
    expect(empty).toEqual({ classic: true, clarity: true });
    const rows = [
      { id: 'b1', status: 'completed', started_at: '2026-11-10T16:30:00Z' },
      { id: 'b2', status: 'failed', started_at: '2026-11-09T16:30:00Z' },
      { id: 'b3', status: '', started_at: '2026-11-08T16:30:00Z' },
    ];
    const list = await both({ backupHistory: rows }, () => (
      [...screen.getByRole('list', { name: /Backup history/i }).querySelectorAll('li')].map(li => [li.querySelector('time').textContent, li.textContent.match(/Completed|Failed|Unknown/)[0]])));
    expect(list.clarity).toEqual(list.classic);
    expect(list.clarity.map(([, s]) => s)).toEqual(['Completed', 'Failed', 'Unknown']);
  });

  it('recent admin activity: empty and real rows', async () => {
    const empty = await both({}, () => Boolean(screen.getByText('No administrative activity has been recorded.')));
    expect(empty).toEqual({ classic: true, clarity: true });
    const logs = [{ id: 'a1', action: 'Invited user', message: 'Ana (teacher)', actorName: 'Admin One', created_at: '2026-11-10T03:00:00Z' }];
    const r = await both({ activityLogs: logs }, () => {
      const li = screen.getByRole('list', { name: /Recent admin activity/i }).querySelector('li');
      return ['Invited user', 'Ana (teacher)', 'Admin One', li.querySelector('time').textContent].map(t => li.textContent.includes(t));
    });
    expect(r.clarity).toEqual(r.classic);
    expect(r.clarity).toEqual([true, true, true, true]);
  });
});
