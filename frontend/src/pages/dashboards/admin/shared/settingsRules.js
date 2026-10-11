export const SETTINGS_QUARTERS = [
  '1st Quarter',
  '2nd Quarter',
  '3rd Quarter',
  '4th Quarter',
];

export const SETTINGS_TIMEOUTS = ['15 min', '30 min', '1 hour', '2 hours'];

export const validateAcademicYear = (value) => {
  if (!/^\d{4}-\d{4}$/.test(value || '')) {
    return 'Enter an academic year in YYYY-YYYY format.';
  }
  const [start, end] = value.split('-').map(Number);
  return end === start + 1
    ? ''
    : 'The ending year must be exactly one year after the starting year.';
};

export const isSupportedQuarter = (value) => SETTINGS_QUARTERS.includes(value);
export const isSupportedSessionTimeout = (value) => SETTINGS_TIMEOUTS.includes(value);

export const quarterToNumber = (value) => {
  const index = SETTINGS_QUARTERS.indexOf(value);
  return index === -1 ? null : index + 1;
};

export const quarterFromNumber = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= SETTINGS_QUARTERS.length
    ? SETTINGS_QUARTERS[number - 1]
    : null;
};

export const isActiveMainAdmin = (userData) => {
  const rawRole = userData?.profile?.role ?? userData?.role;
  const role = String(rawRole || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const status = String(userData?.profile?.status ?? userData?.status ?? '').trim().toLowerCase();
  return role === 'main_admin' && status === 'active';
};

export const classifySettingsReadError = (error) => {
  if (!error) return null;
  const status = Number(error.status || error.statusCode || 0);
  const code = String(error.code || '').toUpperCase();
  if (status === 401 || code === 'PGRST301') return 'authentication';
  if (status === 403 || code === '42501') return 'authorization';
  if (code === '42P01' || code === '42703' || code === 'PGRST204') return 'schema';
  if (error.offline) return 'network';
  if (status >= 500 || code === 'XX000') return 'server';
  return 'unknown';
};

export const settingsReadMessage = (kind) => ({
  authentication: 'Your session could not be verified. Sign in again, then retry.',
  authorization: 'You do not have permission to load system settings.',
  schema: 'System Settings are unavailable because the database configuration is incomplete.',
  network: 'System Settings could not be reached. Check your connection and retry.',
  server: 'System Settings are temporarily unavailable. Please retry.',
  malformed: 'System Settings returned an unexpected response. Please retry.',
  invalid_quarter: 'The stored Quarter is invalid. Database reconciliation is required before Settings can be changed.',
  invalid_timeout: 'The stored Session Timeout is unsupported. Database reconciliation is required before Settings can be changed.',
  unknown: 'System Settings could not be loaded. Please retry.',
}[kind] || 'System Settings could not be loaded. Please retry.');

export const validateSettingsValues = ({ academicYear, quarter, sessionTimeout }) => ({
  academicYear: validateAcademicYear(academicYear),
  quarter: isSupportedQuarter(quarter) ? '' : 'Select one of the supported quarters.',
  sessionTimeout: isSupportedSessionTimeout(sessionTimeout) ? '' : 'Select one of the supported session timeouts.',
});

export const buildSettingsUpdate = ({ academicYear, quarter, sessionTimeout, updatedAt }) => {
  const errors = validateSettingsValues({ academicYear, quarter, sessionTimeout });
  if (Object.values(errors).some(Boolean)) return { payload: null, errors };
  return {
    errors,
    payload: {
      school_year: academicYear,
      current_semester: quarterToNumber(quarter),
      session_timeout: sessionTimeout,
      updated_at: updatedAt,
    },
  };
};

export const verifyUpdatedSettingsRows = (rows, expected) => {
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const row = rows[0];
  if (Number(row?.id) !== 1) return null;
  if (row.school_year !== expected.school_year
    || Number(row.current_semester) !== expected.current_semester
    || row.session_timeout !== expected.session_timeout) return null;
  return row;
};
