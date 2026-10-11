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
// The save contract owns only the three editable database-backed values.
// ============================================

import { useEffect } from 'react';
import { useDelayedFlag } from '../../../../lib/useDelayedFlag';
import Button from '../../../../components/ui/Button';
import { useAdminContext } from '../AdminContext';
import { formatDateTime } from '../../../../lib/formatDate';

const normalizedStatus = (status) => String(status || '').trim().toLowerCase();

const statusLabel = (status) => {
  const normalized = normalizedStatus(status);
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : 'Unknown';
};

const statusBadge = (status) => ({
  completed: 'badge-green',
  running: 'badge-yellow',
  failed: 'badge-red',
}[normalizedStatus(status)] || 'badge-grey');

const SettingsTab = () => {
  const {
    activityLogs, backupHistory,
    saveSettings, sessionTimeout, setSessionTimeout,
    setSettings, settings, settingsSaving,
    settingsDirty, settingsChangeCount, discardSettings,
    themePref, setThemePref, settingsStatus, settingsError,
    settingsValidation, settingsAuthorized, settingsCanEdit, settingsCanSave,
    fetchSettings, backupHistoryStatus, backupHistoryError, fetchBackupHistory,
    overviewLoading,
  } = useAdminContext();

  // The 300ms rule, as everywhere else: a read that returns quickly shows
  // no spinner at all, and a slow one says it is working rather than
  // claiming there is nothing to show.
  const slowActivity = useDelayedFlag(overviewLoading);
  const slowBackup = useDelayedFlag(backupHistoryStatus === 'idle' || backupHistoryStatus === 'loading');
  const settingsReady = settingsStatus === 'ready';

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
        <div className="page-sub">Manage academic display, session behavior, appearance, and operational information</div>
      </div>

      <div id="sec-general" className="settings-section">
        <div className="settings-section-title">General</div>
        <div className="settings-card">
          {(settingsStatus === 'idle' || settingsStatus === 'loading') && (
            <div className="settings-state" role="status" aria-live="polite">
              <span className="spin" aria-hidden="true" />
              <span>Loading system settings…</span>
            </div>
          )}
          {(settingsStatus === 'missing' || settingsStatus === 'error') && (
            <div className="settings-state settings-state-error" role="alert">
              <div>
                <div className="settings-label">System Settings unavailable</div>
                <div className="settings-hint">{settingsError}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={fetchSettings}>Retry</Button>
            </div>
          )}
          {settingsReady && !settingsAuthorized && (
            <div className="settings-state settings-state-error" role="alert">
              Only an active Main Admin can change database-backed Settings.
            </div>
          )}
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
              <input
                id="settings-academic-year"
                value={settingsReady ? settings.academic_year : ''}
                onChange={e => setSettings({ ...settings, academic_year: e.target.value })}
                disabled={!settingsCanEdit}
                aria-invalid={settingsReady && Boolean(settingsValidation.academicYear)}
                aria-describedby={`settings-academic-year-hint${settingsReady && settingsValidation.academicYear ? ' settings-academic-year-error' : ''}`}
                style={{ width: '100%' }}
              />
              {/* Narrower than the label suggests. The academic tabs take
                  their year from currentSchoolYear() in academicRules.js,
                  not from this row. Backlogged as a one-source-of-truth
                  question in docs/ux-workarounds.md. */}
              <div className="form-hint" id="settings-academic-year-hint">The institution's official default year, shown on the Overview banner. Subjects are global and are not scoped by year. Other academic workflows keep their existing current/historical year selectors until a later reconciliation.</div>
              {settingsReady && settingsValidation.academicYear && <div className="field-error" id="settings-academic-year-error">{settingsValidation.academicYear}</div>}
            </div>
          </div>
          <div className="settings-input-row">
            <label className="settings-input-label" htmlFor="settings-quarter">Quarter</label>
            <div style={{ flex: 1 }}>
              <select id="settings-quarter" value={settingsReady ? settings.semester : ''} onChange={e => setSettings({ ...settings, semester: e.target.value })} disabled={!settingsCanEdit} style={{ width: '100%' }} aria-describedby="settings-quarter-hint">
                {!settingsReady && <option value="">Unavailable</option>}
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
          {/* What sign-in actually is. MFA needs enrollment, challenge and
              enforcement flows; none exists in this application, so the old
              Two-Factor row is gone rather than presented as a setting. */}
          <div className="settings-row">
            <div>
              <div className="settings-label">Authentication Method</div>
              <div className="settings-hint">Users sign in with email and password. Password reset links are sent through Supabase Auth.</div>
            </div>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Session Timeout</div>
              <div className="settings-hint">After this setting is saved, each browser applies it on its next portal load and signs the user out after this long without mouse, keyboard, scroll or touch activity.</div>
            </div>
            <select value={settingsReady ? sessionTimeout : ''} onChange={e => setSessionTimeout(e.target.value)} aria-label="Session Timeout" disabled={!settingsCanEdit}>
              {!settingsReady && <option value="">Unavailable</option>}
              <option>15 min</option><option>30 min</option><option>1 hour</option><option>2 hours</option>
            </select>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Sign-in Attempt Protection</div>
              <div className="settings-hint">After 5 consecutive incorrect-password submissions, this browser pauses sign-in for 60 seconds. Supabase Auth separately rate-limits authentication traffic.</div>
            </div>
            <span className="badge badge-grey">5 attempts · 60 sec</span>
          </div>
        </div>
      </div>

      <div id="sec-notifications" className="settings-section">
        <div className="settings-section-title">Notifications</div>
        <div className="settings-card">
          <div className="settings-row">
            <div>
              <div className="settings-label">Portal Email Notifications</div>
              <div className="settings-hint">The portal currently does not send announcement, memo, calendar, or activity email notifications. Authentication emails, including password reset and email verification, are handled by Supabase Auth.</div>
            </div>
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
              <div className="settings-label">Automated Backup</div>
              <div className="settings-hint">GitHub Actions backs up the database and uploaded storage files every day at 12:30 AM (Manila time). The schedule is managed outside this portal.</div>
            </div>
            <span className="badge badge-grey">Daily</span>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Backup Retention</div>
              <div className="settings-hint">Each downloadable backup artifact is retained for 7 days.</div>
            </div>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Activity Log Retention</div>
              <div className="settings-hint">Activity logs are kept indefinitely. No automated retention policy is implemented.</div>
            </div>
          </div>
          <div className="settings-history">
            <div className="settings-history-header">
              <div>
                <div className="settings-label" id="backup-history-heading">Backup History</div>
                <div className="settings-hint">The 10 most recent runs recorded by the backup workflow.</div>
              </div>
            </div>
            {(backupHistoryStatus === 'idle' || backupHistoryStatus === 'loading')
              ? <div className="settings-history-empty" role="status">{slowBackup ? 'Loading backup history…' : ''}</div>
              : backupHistoryStatus === 'error'
                ? <div className="settings-history-empty settings-state-error" role="alert">
                    <span>{backupHistoryError}</span>
                    <Button variant="ghost" size="sm" onClick={fetchBackupHistory}>Retry backup history</Button>
                  </div>
              : backupHistory.length === 0 && <div className="settings-history-empty">No backup runs have been recorded.</div>}
            {backupHistoryStatus === 'ready' && backupHistory.length > 0 && (
              <ul className="settings-history-list" aria-labelledby="backup-history-heading">
                {backupHistory.map(backup => (
                  <li className="settings-history-item" key={backup.id}>
                    <div className="settings-history-content">
                      <div className="settings-history-primary">Database &amp; storage backup</div>
                      <div className="settings-history-meta">
                        <time dateTime={backup.started_at}>{formatDateTime(backup.started_at)}</time>
                      </div>
                    </div>
                    <span className={`badge ${statusBadge(backup.status)}`}>{statusLabel(backup.status)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="settings-history">
            <div className="settings-history-header">
              <div>
                <div className="settings-label" id="activity-history-heading">Recent Admin Activity</div>
                <div className="settings-hint">The 5 most recent administrative actions recorded by the portal.</div>
              </div>
            </div>
            {overviewLoading
              ? <div className="settings-history-empty">{slowActivity ? 'Loading activity…' : ''}</div>
              : activityLogs.length === 0 && <div className="settings-history-empty">No administrative activity has been recorded.</div>}
            {!overviewLoading && activityLogs.length > 0 && (
              <ul className="settings-history-list" aria-labelledby="activity-history-heading">
                {activityLogs.map(log => (
                  <li className="settings-history-item" key={log.id}>
                    <div className="settings-history-content">
                      <div className="settings-history-primary">{log.action}</div>
                      {log.message && <div className="settings-history-detail">{log.message}</div>}
                      <div className="settings-history-meta">
                        <span>{log.actorName}</span>
                        <span aria-hidden="true">·</span>
                        <time dateTime={log.created_at}>{formatDateTime(log.created_at)}</time>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
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
            <select value={themePref} onChange={e => setThemePref(e.target.value)} aria-label="Theme">
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="auto">Auto (match my device)</option>
            </select>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Language</div>
              <div className="settings-hint">The portal interface is available in English only.</div>
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
            <Button variant="ghost" onClick={discardSettings} disabled={!settingsReady || !settingsAuthorized || settingsSaving}>Discard</Button>
            <Button onClick={saveSettings} busy={settingsSaving} disabled={!settingsCanSave}>Save Changes</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsTab;
