// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));

const SettingsTab = (await import('./SettingsTab')).default;

beforeEach(() => {
  h.ctx = {
    activityLogs: [],
    backupHistory: [],
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
    overviewLoading: false,
  };
});

afterEach(cleanup);

describe('Admin Security settings truthfulness', () => {
  it('describes the implemented authentication, inactivity, and attempt behavior', () => {
    render(<SettingsTab />);

    expect(screen.getByText('Authentication Method')).toBeTruthy();
    expect(screen.getByText(/Users sign in with email and password/)).toBeTruthy();
    expect(screen.queryByText('Two-Factor Authentication')).toBeNull();
    expect(screen.getByLabelText('Session Timeout').value).toBe('15 min');
    expect(screen.getByText(/next portal load/)).toBeTruthy();
    expect(screen.getByText('Sign-in Attempt Protection')).toBeTruthy();
    expect(screen.getByText(/this browser pauses sign-in for 60 seconds/)).toBeTruthy();
    expect(screen.getByText('5 attempts · 60 sec')).toBeTruthy();
  });
});
