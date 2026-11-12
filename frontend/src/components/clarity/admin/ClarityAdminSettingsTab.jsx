// ============================================
// FILE: src/components/clarity/admin/ClarityAdminSettingsTab.jsx
// The Admin System Settings tab in Clarity (final design, real settings only).
// A section list on the left and one card per section, all mounted at once
// (as in the classic tab), so moving between sections never drops an edit.
// The section list calls the same scrollToSection the shell's sub-nav uses.
//
// Only three values are editable (Academic Year, Quarter, Session Timeout),
// through the same context setters; the context computes settingsDirty, and
// the shell's leave confirm reads it, exactly as with the classic tab. Theme
// is per-device and saves itself (setThemePref), with the classic options.
// Every other row is the classic read-only statement of what the system
// does: the design's switches and selects for those rows have no setting
// behind them, so they are not drawn.
//
// TEMPORARY word-for-word copies from pages/dashboards/admin/tabs/SettingsTab.jsx
// (source-parity tested in ClarityAdminA7Sources.test.js, behaviour-parity
// tested in ClarityAdminSettingsTab.test.jsx); after the defense the classic
// tab and this one should share them. No substitutions.
//   - the backup status helpers, :35-48
//   - the slow-load flags, settingsReady and the beforeunload warning, :62-75
// ============================================

import { useEffect } from 'react';
import { useDelayedFlag } from '../../../lib/useDelayedFlag';
import { formatDateTime } from '../../../lib/formatDate';
import { useAdminContext } from '../../../pages/dashboards/admin/AdminContext';

// ---- TEMPORARY copy (SettingsTab.jsx:35-48) ----
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
// ---- end of the copy ----

// The classic badge colours, as Clarity pill tones.
const TONE = { 'badge-green': 'ok', 'badge-yellow': 'wa', 'badge-red': 'er', 'badge-grey': '' };

// The shell's sections (ClarityAdminLayout SETTINGS_SECTIONS), same ids.
const SECTIONS = [
  ['sec-general', 'General'],
  ['sec-security', 'Security'],
  ['sec-notifications', 'Notifications'],
  ['sec-backup', 'Backup & Logs'],
  ['sec-appearance', 'Appearance'],
];

// The classic Theme options (SettingsTab.jsx:292-294): values and full labels.
const THEMES = [['dark', 'Dark', 'Dark'], ['light', 'Light', 'Light'], ['auto', 'Auto', 'Auto (match my device)']];

// One row: what it is, what the system does, and the control (if any).
const Row = ({ label, hint, hintId, children }) => (
  <div className="x-set">
    <div className="x-set-copy">
      <b>{label}</b>
      <span className="d" id={hintId}>{hint}</span>
    </div>
    {children}
  </div>
);

const ClarityAdminSettingsTab = () => {
  const {
    activityLogs = [], backupHistory = [],
    saveSettings, sessionTimeout, setSessionTimeout,
    setSettings, settings = {}, settingsSaving,
    settingsDirty, settingsChangeCount, discardSettings,
    themePref, setThemePref, settingsStatus, settingsError,
    settingsValidation = {}, settingsAuthorized, settingsCanEdit, settingsCanSave,
    fetchSettings, backupHistoryStatus, backupHistoryError, fetchBackupHistory,
    overviewLoading, activeSettingsSub = 'sec-general', scrollToSection,
  } = useAdminContext();

  // ---- TEMPORARY copy (SettingsTab.jsx:62-75) ----
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
  // ---- end of the copy ----

  return (
    <div className="x-set-page">
      <div className="x-head x-ov-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="x-h1" tabIndex={-1}>System Settings</h1>
          <p className="x-sub">Manage academic display, session behavior, appearance, and operational information</p>
        </div>
      </div>

      <div className="x-set-layout">
        <nav className="x-set-nav" aria-label="Settings sections">
          {SECTIONS.map(([id, label]) => (
            <button key={id} type="button" className={activeSettingsSub === id ? 'on' : undefined}
              aria-current={activeSettingsSub === id ? 'true' : undefined}
              onClick={() => scrollToSection(id)}>{label}</button>
          ))}
        </nav>

        <div className="x-set-cards">
          <section id="sec-general" className="x-card x-pad x-set-card" aria-labelledby="x-set-h-general">
            <h2 className="x-ct" id="x-set-h-general">General</h2>
            {(settingsStatus === 'idle' || settingsStatus === 'loading') && (
              <p className="x-set-state" role="status" aria-live="polite">Loading system settings…</p>
            )}
            {(settingsStatus === 'missing' || settingsStatus === 'error') && (
              <div className="x-set-state x-set-error" role="alert">
                <span><b>System Settings unavailable</b> {settingsError}</span>
                <button type="button" className="x-btn" onClick={fetchSettings}>Retry</button>
              </div>
            )}
            {settingsReady && !settingsAuthorized && (
              <p className="x-set-state x-set-error" role="alert">Only an active Main Admin can change database-backed Settings.</p>
            )}
            <Row label={<label htmlFor="settings-portal-name">Portal name</label>} hint="Set by the developer. Not editable here." hintId="settings-portal-name-hint">
              <input id="settings-portal-name" className="x-input" value="EduScribe Portal" readOnly disabled aria-describedby="settings-portal-name-hint" />
            </Row>
            <Row label={<label htmlFor="settings-academic-year">Academic year</label>}
              hint="The institution's official year. Teachers see this year, and Teaching Load, Sections and Schedules open in it. Subjects are global and are not scoped by year."
              hintId="settings-academic-year-hint">
              <div className="x-set-field">
                <input
                  id="settings-academic-year"
                  className="x-input"
                  value={settingsReady ? settings.academic_year : ''}
                  onChange={e => setSettings({ ...settings, academic_year: e.target.value })}
                  disabled={!settingsCanEdit}
                  aria-invalid={settingsReady && Boolean(settingsValidation.academicYear)}
                  aria-describedby={`settings-academic-year-hint${settingsReady && settingsValidation.academicYear ? ' settings-academic-year-error' : ''}`}
                />
                {settingsReady && settingsValidation.academicYear && <span className="x-set-err" id="settings-academic-year-error">{settingsValidation.academicYear}</span>}
              </div>
            </Row>
            <Row label={<label htmlFor="settings-quarter">Quarter</label>} hint="Shown on the Overview banner." hintId="settings-quarter-hint">
              <select id="settings-quarter" className="x-select" value={settingsReady ? settings.semester : ''} onChange={e => setSettings({ ...settings, semester: e.target.value })} disabled={!settingsCanEdit} aria-describedby="settings-quarter-hint">
                {!settingsReady && <option value="">Unavailable</option>}
                <option>1st Quarter</option><option>2nd Quarter</option><option>3rd Quarter</option><option>4th Quarter</option>
              </select>
            </Row>
          </section>

          <section id="sec-security" className="x-card x-pad x-set-card" aria-labelledby="x-set-h-security">
            <h2 className="x-ct" id="x-set-h-security">Security</h2>
            <Row label="Authentication method" hint="Users sign in with email and password. Password reset links are sent through Supabase Auth." />
            <Row label={<label htmlFor="settings-session-timeout">Session timeout</label>}
              hint="After this setting is saved, each browser applies it on its next portal load and signs the user out after this long without mouse, keyboard, scroll or touch activity.">
              <select id="settings-session-timeout" className="x-select" value={settingsReady ? sessionTimeout : ''} onChange={e => setSessionTimeout(e.target.value)} aria-label="Session Timeout" disabled={!settingsCanEdit}>
                {!settingsReady && <option value="">Unavailable</option>}
                <option>15 min</option><option>30 min</option><option>1 hour</option><option>2 hours</option>
              </select>
            </Row>
            <Row label="Sign-in attempt protection"
              hint="After 5 consecutive incorrect-password submissions, this browser pauses sign-in for 60 seconds. Supabase Auth separately rate-limits authentication traffic.">
              <span className="x-badge">5 attempts · 60 sec</span>
            </Row>
          </section>

          <section id="sec-notifications" className="x-card x-pad x-set-card" aria-labelledby="x-set-h-notifications">
            <h2 className="x-ct" id="x-set-h-notifications">Notifications</h2>
            <Row label="Portal email notifications"
              hint="The portal currently does not send announcement, memo, calendar, or activity email notifications. Authentication emails, including password reset and email verification, are handled by Supabase Auth." />
          </section>

          <section id="sec-backup" className="x-card x-pad x-set-card" aria-labelledby="x-set-h-backup">
            <h2 className="x-ct" id="x-set-h-backup">Backup &amp; logs</h2>
            <Row label="Automated backup"
              hint="GitHub Actions backs up the database and uploaded storage files every day at 12:30 AM (Manila time). The schedule is managed outside this portal.">
              <span className="x-badge">Daily</span>
            </Row>
            <Row label="Backup retention" hint="Each downloadable backup artifact is retained for 7 days." />
            <Row label="Activity log retention" hint="Activity logs are kept indefinitely. No automated retention policy is implemented." />

            <div className="x-set-history">
              <h3 className="x-set-h3" id="backup-history-heading">Backup history</h3>
              <p className="x-cs">The 10 most recent runs recorded by the backup workflow.</p>
              {(backupHistoryStatus === 'idle' || backupHistoryStatus === 'loading')
                ? <p className="x-set-empty" role="status">{slowBackup ? 'Loading backup history…' : ''}</p>
                : backupHistoryStatus === 'error'
                  ? <div className="x-set-empty x-set-error" role="alert">
                      <span>{backupHistoryError}</span>
                      <button type="button" className="x-btn" onClick={fetchBackupHistory}>Retry backup history</button>
                    </div>
                  : backupHistory.length === 0 && <p className="x-set-empty">No backup runs have been recorded.</p>}
              {backupHistoryStatus === 'ready' && backupHistory.length > 0 && (
                <ul className="x-set-list" aria-labelledby="backup-history-heading">
                  {backupHistory.map(backup => (
                    <li key={backup.id}>
                      <div className="x-set-copy">
                        <b>Database &amp; storage backup</b>
                        <span className="d"><time dateTime={backup.started_at}>{formatDateTime(backup.started_at)}</time></span>
                      </div>
                      <span className={`x-badge ${TONE[statusBadge(backup.status)]}`}>{statusLabel(backup.status)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="x-set-history">
              <h3 className="x-set-h3" id="activity-history-heading">Recent admin activity</h3>
              <p className="x-cs">The 5 most recent administrative actions recorded by the portal.</p>
              {overviewLoading
                ? <p className="x-set-empty">{slowActivity ? 'Loading activity…' : ''}</p>
                : activityLogs.length === 0 && <p className="x-set-empty">No administrative activity has been recorded.</p>}
              {!overviewLoading && activityLogs.length > 0 && (
                <ul className="x-set-list" aria-labelledby="activity-history-heading">
                  {activityLogs.map(log => (
                    <li key={log.id}>
                      <div className="x-set-copy">
                        <b>{log.action}</b>
                        {log.message && <span className="d">{log.message}</span>}
                        <span className="d">
                          <span>{log.actorName}</span>
                          <span aria-hidden="true"> · </span>
                          <time dateTime={log.created_at}>{formatDateTime(log.created_at)}</time>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section id="sec-appearance" className="x-card x-pad x-set-card" aria-labelledby="x-set-h-appearance">
            <h2 className="x-ct" id="x-set-h-appearance">Appearance</h2>
            <Row label="Theme" hint="Applies to this device only, and takes effect immediately. The dark-mode button in the header is the same setting.">
              <div className="x-seg" role="group" aria-label="Theme">
                {THEMES.map(([value, short, full]) => (
                  <button key={value} type="button" className={themePref === value ? 'on' : undefined}
                    aria-pressed={themePref === value} aria-label={full} onClick={() => setThemePref(value)}>{short}</button>
                ))}
              </div>
            </Row>
            <Row label="Language" hint="The portal interface is available in English only.">
              <span className="x-badge">English only</span>
            </Row>
          </section>

          {/* Shown only while there is something to save, as in classic. */}
          {settingsDirty && (
            <div className="x-savebar x-set-savebar" role="status">
              <b>{settingsChangeCount} unsaved change{settingsChangeCount === 1 ? '' : 's'}</b>
              <div className="x-set-saveact">
                <button type="button" className="x-btn gh" onClick={discardSettings} disabled={!settingsReady || !settingsAuthorized || settingsSaving}>Discard</button>
                <button type="button" className="x-btn pri" aria-busy={settingsSaving || undefined} onClick={saveSettings} disabled={!settingsCanSave}>
                  {settingsSaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClarityAdminSettingsTab;
