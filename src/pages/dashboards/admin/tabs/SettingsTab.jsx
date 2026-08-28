// ============================================
// FILE: src/pages/dashboards/admin/tabs/SettingsTab.jsx
// Split from the original monolithic AdminDashboard.jsx (1,980 lines)
// ============================================

import React from 'react';
import { useAdminContext } from '../AdminContext';

const SettingsTab = () => {
  const {
    Toggle, activityLogsDays, autoBackup, autoSave, emailNotifications,
    language, lmsIntegration, loginAttemptLimit, notifications,
    saveSettings, sessionTimeout, setActivityLogsDays, setAutoBackup,
    setAutoSave, setDarkMode, setEmailNotifications, setLanguage,
    setLmsIntegration, setLoginAttemptLimit, setSessionTimeout,
    setSettings, setSmsGateway, setTheme, setTwoFactorAuth, settings,
    settingsSaving, smsGateway, theme, twoFactorAuth
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
                    <input value={settings.portal_name} onChange={e => setSettings({...settings, portal_name: e.target.value})} style={{ flex:1 }} />
                  </div>
                  <div className="settings-input-row">
                    <span className="settings-input-label">Academic Year</span>
                    <input value={settings.academic_year} onChange={e => setSettings({...settings, academic_year: e.target.value})} style={{ flex:1 }} />
                  </div>
                  <div className="settings-input-row">
                    <span className="settings-input-label">Semester</span>
                    <select value={settings.semester} onChange={e => setSettings({...settings, semester: e.target.value})} style={{ flex:1 }}>
                      <option>1st Semester</option><option>2nd Semester</option><option>Summer</option>
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
                    <Toggle on={twoFactorAuth} onClick={() => setTwoFactorAuth(!twoFactorAuth)} />
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
                    <Toggle on={loginAttemptLimit} onClick={() => setLoginAttemptLimit(!loginAttemptLimit)} />
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

              <div id="sec-integrations" className="settings-section">
                <div className="settings-section-title">Integrations</div>
                <div className="settings-card">
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">LMS Integration</div>
                      <div className="settings-hint">Connect to Google Classroom or Moodle</div>
                    </div>
                    <Toggle on={lmsIntegration} onClick={() => setLmsIntegration(!lmsIntegration)} />
                  </div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">SMS Gateway</div>
                      <div className="settings-hint">Send SMS alerts to parents</div>
                    </div>
                    <Toggle on={smsGateway} onClick={() => setSmsGateway(!smsGateway)} />
                  </div>
                </div>
              </div>

              <div id="sec-backup" className="settings-section">
                <div className="settings-section-title">Backup & Logs</div>
                <div className="settings-card">
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Auto-Backup</div>
                      <div className="settings-hint">Daily database backup to cloud storage</div>
                    </div>
                    <Toggle on={autoBackup} onClick={() => setAutoBackup(!autoBackup)} />
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
                    <select value={language} onChange={e => setLanguage(e.target.value)} style={{ width:'auto' }}>
                      <option>English</option><option>Filipino</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
  );
};

export default SettingsTab;
