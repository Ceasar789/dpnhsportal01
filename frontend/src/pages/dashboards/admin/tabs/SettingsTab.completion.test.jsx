// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));

const SettingsTab = (await import('./SettingsTab')).default;

beforeEach(() => {
  h.ctx = {
    activityLogs: [{
      id: 'activity-1',
      action: 'Updated system settings',
      message: 'Changed the academic year',
      actorName: 'Admin User',
      created_at: '2026-10-08T09:55:17.853Z',
    }],
    backupHistory: [
      { id: 'backup-1', status: 'completed', started_at: '2026-10-07T21:27:29.000Z' },
      { id: 'backup-2', status: 'FAILED', started_at: '2026-10-06T16:30:00.000Z' },
    ],
    saveSettings: vi.fn(),
    sessionTimeout: '15 min',
    setSessionTimeout: vi.fn(),
    setSettings: vi.fn(),
    settings: { academic_year: '2026-2027', semester: '1st Quarter' },
    settingsSaving: false,
    settingsDirty: false,
    settingsChangeCount: 0,
    discardSettings: vi.fn(),
    themePref: 'light',
    setThemePref: vi.fn(),
    settingsLoading: false,
    settingsStatus: 'ready',
    settingsError: '',
    settingsValidation: { academicYear: '', quarter: '', sessionTimeout: '' },
    settingsAuthorized: true,
    settingsCanEdit: true,
    settingsCanSave: false,
    fetchSettings: vi.fn(),
    backupHistoryStatus: 'ready',
    backupHistoryError: '',
    fetchBackupHistory: vi.fn(),
    overviewLoading: false,
  };
});

afterEach(cleanup);

describe('Admin Settings completion', () => {
  it('describes current email and backup capabilities without placeholder controls', () => {
    render(<SettingsTab />);

    expect(screen.getByText('Portal Email Notifications')).toBeTruthy();
    expect(screen.getByText(/does not send announcement, memo, calendar, or activity email notifications/)).toBeTruthy();
    expect(screen.getByText(/password reset and email verification, are handled by Supabase Auth/)).toBeTruthy();
    expect(screen.getByText(/GitHub Actions backs up the database and uploaded storage files/)).toBeTruthy();
    expect(screen.getByText(/retained for 7 days/)).toBeTruthy();
    expect(screen.getByText(/No automated retention policy is implemented/)).toBeTruthy();
    expect(screen.getByText(/Subjects are global and are not scoped by year/)).toBeTruthy();
    expect(screen.queryByText(/not available|coming soon/i)).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('groups backup runs and recent activity with meaningful labels', () => {
    render(<SettingsTab />);

    const backups = screen.getByRole('list', { name: 'Backup History' });
    expect(within(backups).getAllByRole('listitem')).toHaveLength(2);
    expect(within(backups).getAllByText('Database & storage backup')).toHaveLength(2);
    expect(within(backups).getByText('Completed')).toBeTruthy();
    expect(within(backups).getByText('Failed')).toBeTruthy();

    const activity = screen.getByRole('list', { name: 'Recent Admin Activity' });
    expect(within(activity).getByText('Updated system settings')).toBeTruthy();
    expect(within(activity).getByText('Changed the academic year')).toBeTruthy();
    expect(within(activity).getByText('Admin User')).toBeTruthy();
  });
});
