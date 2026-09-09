// ============================================
// FILE: src/pages/dashboards/admin/tabs/SettingsTab.jsx
// Split from the original monolithic AdminDashboard.jsx (1,980 lines)
// ============================================

import React from 'react';
import { useAdminContext } from '../AdminContext';

const SettingsTab = () => {
  const {
    Toggle, activityLogs, activityLogsDays, autoBackup, autoSave, backupFrequency, backupHistory, backupTime, emailNotifications,
    language, loginAttemptLimit,
    saveSettings, sessionTimeout, setActivityLogsDays, setAutoBackup,
    setBackupFrequency, setBackupTime,
    setAutoSave, setDarkMode, setEmailNotifications, setLanguage,
    setLoginAttemptLimit, setSessionTimeout,
    setSettings, setTheme, settings,
    settingsSaving, theme, twoFactorAuth
  } = useAdminContext();

  return (
            <div>
              <div className="page-title">System Settings</div>
              <div className="page-sub">Configure portal name, academic year, and system preferences</div>

              <div id="sec-general" className="settings-section">
                <div className="settings-section-title">General</div>
                <div className="settings-card">
                  <div className="settings-input-row">
                    <span className="settings-input-label">Portal Name</span>
                    <input value="EduScribe Portal" readOnly disabled style={{ flex:1 }} />
                  </div>
                  <div className="settings-input-row">
                    <span className="settings-input-label">Academic Year</span>
                    <input value={settings.academic_year} onChange={e => setSettings({...settings, academic_year: e.target.value})} style={{ flex:1 }} />
                  </div>
                  <div className="settings-input-row">
                    <span className="settings-input-label">Quarter</span>
                    <select value={settings.semester} onChange={e => setSettings({...settings, semester: e.target.value})} style={{ flex:1 }}>
                      <option>1st Quarter</option><option>2nd Quarter</option><option>3rd Quarter</option><option>4th Quarter</option>
                    </select>
                  </div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Auto-Save Settings</div>
                      <div className="settings-hint">Automatically save changes after 2 seconds</div>
                    </div>
                    <Toggle on={autoSave} onClick={() => setAutoSave(!autoSave)} />
                  </div>
                  <div className="settings-save">
                    <button className="btn btn-primary" onClick={saveSettings} disabled={settingsSaving}>
                      {settingsSaving ? <span className="spin" style={{ width:16, height:16, marginRight:6 }}></span> : null}
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>

              <div id="sec-security" className="settings-section">
                <div className="settings-section-title">Security</div>
                <div className="settings-card">
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Two-Factor Authentication</div>
                      <div className="settings-hint">Require 2FA for all admin logins</div>
                    </div>
                      <span className="badge badge-green">Locked On</span>
                  </div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Session Timeout</div>
                      <div className="settings-hint">Auto-logout after inactivity</div>
                    </div>
                    <select value={sessionTimeout} onChange={e => setSessionTimeout(e.target.value)} style={{ width:'auto' }}>
                      <option>15 min</option><option>30 min</option><option>1 hour</option><option>2 hours</option>
                    </select>
                  </div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Login Attempt Limit</div>
                      <div className="settings-hint">Lock account after 5 failed attempts</div>
                    </div>
                    <span className="badge badge-green">5 Attempts</span>
                  </div>
                </div>
              </div>

              <div id="sec-notifications" className="settings-section">
                <div className="settings-section-title">Notifications</div>
                <div className="settings-card">
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Email Notifications</div>
                      <div className="settings-hint">Send alerts to admin email</div>
                    </div>
                    <Toggle on={emailNotifications} onClick={() => setEmailNotifications(!emailNotifications)} />
                  </div>
                </div>
              </div>

              <div id="sec-backup" className="settings-section">
                <div className="settings-section-title">Backup & Logs</div>
                <div className="settings-card">
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Auto-Backup</div>
                      <div className="settings-hint">Run the configured database backup schedule</div>
                    </div>
                    <Toggle on={autoBackup} onClick={() => setAutoBackup(!autoBackup)} />
                  </div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Backup Frequency</div>
                      <div className="settings-hint">Choose how often the scheduled backup runs</div>
                    </div>
                    <select value={backupFrequency} onChange={e => setBackupFrequency(e.target.value)} style={{ width:'auto' }}>
                      <option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option>
                    </select>
                  </div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Backup Time</div>
                      <div className="settings-hint">Default is midnight (12:00 AM)</div>
                    </div>
                    <input type="time" value={backupTime} onChange={e => setBackupTime(e.target.value)} style={{ width:'auto' }} />
                  </div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Activity Log Retention</div>
                      <div className="settings-hint">How long to keep system logs</div>
                    </div>
                    <select value={activityLogsDays} onChange={e => setActivityLogsDays(e.target.value)} style={{ width:'auto' }}>
                      <option>30 days</option><option>90 days</option><option>1 year</option>
                    </select>
                  </div>
                  <div className="settings-history">
                    <div className="settings-label">Backup History</div>
                    <div className="settings-hint">Scheduled backup records will appear here with date and time.</div>
                    {backupHistory.length === 0 && <div className="settings-history-empty">No backup history yet.</div>}
                    {backupHistory.map(backup => <div className="settings-history-item" key={backup.id}>{new Date(backup.started_at).toLocaleString()} · {backup.status}</div>)}
                  </div>
                  <div className="settings-history">
                    <div className="settings-label">Activity Log History</div>
                    <div className="settings-hint">Recent admin activity retained according to the selected period.</div>
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
                      <div className="settings-hint">System-wide color scheme</div>
                    </div>
                    <select value={theme} onChange={e => { setTheme(e.target.value); setDarkMode(e.target.value === 'Dark'); }} style={{ width:'auto' }}>
                      <option>Dark</option><option>Light</option><option>Auto</option>
                    </select>
                  </div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Language</div>
                      <div className="settings-hint">Portal display language</div>
                    </div>
                    <select value="English" disabled style={{ width:'auto' }}><option>English</option></select>
                  </div>
                </div>
              </div>
            </div>
  );
};

export default SettingsTab;
