// ============================================
// FILE: src/pages/dashboards/admin/tabs/SettingsTab.jsx
// Split from the original monolithic AdminDashboard.jsx (1,980 lines)
//
// UX-028, and the audit that came out of it.
//
// Two things were wrong with this page and only one of them was the save
// model. The other was that most of these controls did nothing. Every
// column was grepped across the frontend, the backend, the SQL and the
// GitHub workflow; five of sixteen settings have a reader. The rest were
// writing values nobody ever looked at, behind switches that implied the
// system obeyed them.
//
// So the page now has three kinds of row:
//
//   * EDITABLE — Academic Year, Quarter, Session Timeout. These three are
//     read by something. They share one save bar for the whole page.
//   * PER-DEVICE — Theme. Saves itself to this browser, instantly, and is
//     deliberately outside the save bar: a preview you have to press Save
//     to keep is not a preview.
//   * READ-ONLY — everything else. A statement of what the system actually
//     does, as text. Not a disabled input: a disabled switch still says
//     "this is a setting, you just can't reach it", and that is the claim
//     being withdrawn.
//
// Nothing was dropped from the database. saveSettings still sends every
// column it always sent, carrying the value fetchSettings loaded.
// ============================================

import React, { useEffect } from 'react';
import Button from '../../../../components/ui/Button';
import { useAdminContext } from '../AdminContext';

const SettingsTab = () => {
  const {
    activityLogs, backupHistory,
    saveSettings, sessionTimeout, setSessionTimeout,
    setSettings, settings, settingsSaving,
    settingsDirty, settingsChangeCount, discardSettings,
    themePref, setThemePref,
  } = useAdminContext();

  // The sidebar guard covers leaving the page. This covers leaving the tab.
  useEffect(() => {
    if (!settingsDirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [settingsDirty]);

  return (
    <div>
      <div className="page-header-bar">
        <div className="page-title">System Settings</div>
        <div className="page-sub">Configure portal name, academic year, and system preferences</div>
      </div>

      <div id="sec-general" className="settings-section">
        <div className="settings-section-title">General</div>
        <div className="settings-card">
          <div className="settings-input-row">
            <label className="settings-input-label" htmlFor="settings-portal-name">Portal Name</label>
            <div style={{ flex: 1 }}>
              <input id="settings-portal-name" value="EduScribe Portal" readOnly disabled style={{ width: '100%' }} aria-describedby="settings-portal-name-hint" />
              {/* UX-058: disabled next to editable siblings, with nothing
                  saying why or what would change it. */}
              <div className="form-hint" id="settings-portal-name-hint">Set by the developer. Not editable here.</div>
            </div>
          </div>
          <div className="settings-input-row">
            <label className="settings-input-label" htmlFor="settings-academic-year">Academic Year</label>
            <div style={{ flex: 1 }}>
              <input id="settings-academic-year" value={settings.academic_year} onChange={e => setSettings({ ...settings, academic_year: e.target.value })} style={{ width: '100%' }} aria-describedby="settings-academic-year-hint" />
              {/* Narrower than the label suggests. The academic tabs take
                  their year from currentSchoolYear() in academicRules.js,
                  not from this row. Backlogged as a one-source-of-truth
                  question in docs/ux-workarounds.md. */}
              <div className="form-hint" id="settings-academic-year-hint">Shown on the Overview banner. Subjects, sections, schedules and grades use the school year from the calendar, which rolls over every June.</div>
            </div>
          </div>
          <div className="settings-input-row">
            <label className="settings-input-label" htmlFor="settings-quarter">Quarter</label>
            <div style={{ flex: 1 }}>
              <select id="settings-quarter" value={settings.semester} onChange={e => setSettings({ ...settings, semester: e.target.value })} style={{ width: '100%' }} aria-describedby="settings-quarter-hint">
                <option>1st Quarter</option><option>2nd Quarter</option><option>3rd Quarter</option><option>4th Quarter</option>
              </select>
              <div className="form-hint" id="settings-quarter-hint">Shown on the Overview banner.</div>
            </div>
          </div>
        </div>
      </div>

      <div id="sec-security" className="settings-section">
        <div className="settings-section-title">Security</div>
        <div className="settings-card">
          {/* What sign-in actually is. The password-reset email goes out
              through SMTP configured in the Supabase dashboard, which is
              why there is no mail sender anywhere in this repository. */}
          <div className="settings-row">
            <div>
              <div className="settings-label">How people sign in</div>
              <div className="settings-hint">Sign-in: email and password. Forgotten passwords are reset through a link sent to the user's email.</div>
            </div>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Two-Factor Authentication</div>
              <div className="settings-hint">A second step after the password</div>
            </div>
            <span className="badge badge-grey">Not available</span>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Session Timeout</div>
              <div className="settings-hint">Signs the user out after this long with no mouse, key, scroll or touch activity</div>
            </div>
            <select value={sessionTimeout} onChange={e => setSessionTimeout(e.target.value)} style={{ width: 'auto' }} aria-label="Session Timeout">
              <option>15 min</option><option>30 min</option><option>1 hour</option><option>2 hours</option>
            </select>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Login Attempt Limit</div>
              <div className="settings-hint">Failed sign-ins are not counted or limited.</div>
            </div>
            <span className="badge badge-grey">Not configured</span>
          </div>
        </div>
      </div>

      <div id="sec-notifications" className="settings-section">
        <div className="settings-section-title">Notifications</div>
        <div className="settings-card">
          <div className="settings-row">
            <div>
              <div className="settings-label">Email Notifications</div>
              <div className="settings-hint">The portal does not send its own email. Account email from Supabase, such as password resets, is unaffected.</div>
            </div>
            <span className="badge badge-grey">Not available</span>
          </div>
        </div>
      </div>

      <div id="sec-backup" className="settings-section">
        <div className="settings-section-title">Backup &amp; Logs</div>
        <div className="settings-card">
          {/* The three switches that used to be here - Auto-Backup,
              Frequency and Time - were read by nothing. The backup runs from
              .github/workflows/supabase-backup.yml on a fixed cron
              (30 16 * * * UTC), which never looks at this table. */}
          <div className="settings-row">
            <div>
              <div className="settings-label">Backup Schedule</div>
              <div className="settings-hint">Backups run automatically every day at 12:30 AM (Manila time). The schedule is not configurable here.</div>
            </div>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Activity Log Retention</div>
              <div className="settings-hint">Activity logs are currently kept indefinitely. Automatic cleanup is not available yet.</div>
            </div>
          </div>
          <div className="settings-history">
            <div className="settings-label">Backup History</div>
            <div className="settings-hint">Scheduled backup records will appear here with date and time.</div>
            {backupHistory.length === 0 && <div className="settings-history-empty">No backup history yet.</div>}
            {backupHistory.map(backup => <div className="settings-history-item" key={backup.id}>{new Date(backup.started_at).toLocaleString()} · {backup.status}</div>)}
          </div>
          <div className="settings-history">
            <div className="settings-label">Activity Log History</div>
            <div className="settings-hint">Recent admin activity.</div>
            {activityLogs.length === 0 && <div className="settings-history-empty">No activity logs yet.</div>}
            {activityLogs.map(log => <div className="settings-history-item" key={log.id}>{log.action} · {new Date(log.created_at).toLocaleString()}</div>)}
          </div>
        </div>
      </div>

      <div id="sec-appearance" className="settings-section">
        <div className="settings-section-title">Appearance</div>
        <div className="settings-card">
          <div className="settings-row">
            <div>
              <div className="settings-label">Theme</div>
              <div className="settings-hint">Applies to this device only, and takes effect immediately. The dark-mode button in the header is the same setting.</div>
            </div>
            {/* One state, shared with the header button through the single
                useDashboardTheme instance in useAdminLogic — they cannot
                disagree, because there is nothing to disagree with. */}
            <select value={themePref} onChange={e => setThemePref(e.target.value)} style={{ width: 'auto' }} aria-label="Theme">
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="auto">Auto (match my device)</option>
            </select>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Language</div>
              <div className="settings-hint">English is the only language the portal is translated into, so there is nothing else to choose yet.</div>
            </div>
            <span className="badge badge-grey">English only</span>
          </div>
        </div>
      </div>

      {/* role="status" so the bar announces itself when it appears — a
          keyboard user working down the page is told there is now something
          to save, rather than finding out by scrolling. */}
      {settingsDirty && (
        <div className="settings-savebar" role="status">
          <span className="settings-savebar-count">
            {settingsChangeCount} unsaved change{settingsChangeCount === 1 ? '' : 's'}
          </span>
          <div className="settings-savebar-actions">
            <Button variant="ghost" onClick={discardSettings}>Discard</Button>
            <Button onClick={saveSettings} busy={settingsSaving}>Save Changes</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsTab;
