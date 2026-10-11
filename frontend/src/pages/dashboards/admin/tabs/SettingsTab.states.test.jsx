// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));
const SettingsTab = (await import('./SettingsTab')).default;

const base = () => ({
  activityLogs: [], backupHistory: [], saveSettings: vi.fn(), sessionTimeout: '30 min', setSessionTimeout: vi.fn(),
  setSettings: vi.fn(), settings: { academic_year: '2026-2027', semester: '2nd Quarter' }, settingsSaving: false,
  settingsDirty: false, settingsChangeCount: 0, discardSettings: vi.fn(), themePref: 'light', setThemePref: vi.fn(),
  settingsStatus: 'ready', settingsError: '', settingsValidation: { academicYear: '', quarter: '', sessionTimeout: '' },
  settingsAuthorized: true, settingsCanEdit: true, settingsCanSave: false, fetchSettings: vi.fn(),
  backupHistoryStatus: 'ready', backupHistoryError: '', fetchBackupHistory: vi.fn(), overviewLoading: false,
});

beforeEach(() => { h.ctx = base(); });
afterEach(cleanup);

describe('Settings availability states', () => {
  it('shows loading and disables every persisted control', () => {
    h.ctx = { ...base(), settingsStatus: 'loading', settingsCanEdit: false };
    render(<SettingsTab />);
    expect(screen.getByText('Loading system settings…')).toBeTruthy();
    expect(screen.getByLabelText('Academic Year').disabled).toBe(true);
    expect(screen.getByLabelText('Quarter').disabled).toBe(true);
    expect(screen.getByLabelText('Session Timeout').disabled).toBe(true);
  });

  it.each(['missing', 'error'])('fails closed in the %s state and retries', (status) => {
    const fetchSettings = vi.fn();
    h.ctx = { ...base(), settingsStatus: status, settingsCanEdit: false, settingsError: 'Synthetic unavailable state.', fetchSettings };
    render(<SettingsTab />);
    expect(screen.getByRole('alert').textContent).toContain('Synthetic unavailable state.');
    expect(screen.getByLabelText('Academic Year').disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(fetchSettings).toHaveBeenCalledOnce();
  });

  it('exposes the academic-year validation error and disables Save', () => {
    h.ctx = {
      ...base(), settings: { academic_year: '2026-2028', semester: '2nd Quarter' }, settingsDirty: true,
      settingsChangeCount: 1, settingsCanSave: false,
      settingsValidation: { academicYear: 'The ending year must be exactly one year after the starting year.', quarter: '', sessionTimeout: '' },
    };
    render(<SettingsTab />);
    const year = screen.getByLabelText('Academic Year');
    expect(year.getAttribute('aria-invalid')).toBe('true');
    expect(year.getAttribute('aria-describedby')).toContain('settings-academic-year-error');
    expect(screen.getByText(/ending year must be exactly one year/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save Changes' }).disabled).toBe(true);
  });

  it('shows backup failure separately from a genuine empty history and retries', () => {
    const fetchBackupHistory = vi.fn();
    h.ctx = { ...base(), backupHistoryStatus: 'error', backupHistoryError: 'Synthetic backup failure.', fetchBackupHistory };
    render(<SettingsTab />);
    expect(screen.getByText('Synthetic backup failure.')).toBeTruthy();
    expect(screen.queryByText('No backup runs have been recorded.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry backup history' }));
    expect(fetchBackupHistory).toHaveBeenCalledOnce();
  });

  it('keeps Theme available while database-backed Settings are unavailable', () => {
    h.ctx = { ...base(), settingsStatus: 'error', settingsCanEdit: false, settingsError: 'Synthetic error.' };
    render(<SettingsTab />);
    expect(screen.getByLabelText('Theme').disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'dark' } });
    expect(h.ctx.setThemePref).toHaveBeenCalledWith('dark');
  });
});
