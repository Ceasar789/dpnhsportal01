// Which school year the academic tabs are working in, when that needs saying.
// Nothing is shown in the normal case (working in the System Settings year).
// Never blocks an action: a visible warning only.
const WARNING_STYLE = {
  color: 'var(--badge-yellow-fg)', background: 'var(--badge-yellow-bg)',
  border: '1px solid var(--badge-yellow-border)', borderRadius: 'var(--radius-md)',
  padding: 'var(--space-8)', marginBottom: 'var(--space-12)',
};

const schoolYearNoticeText = ({ schoolYear, settingsSchoolYear, schoolYearSource }) => {
  if (schoolYearSource === 'fallback' && schoolYear) {
    return `School year setting could not be loaded. Showing ${schoolYear} from the calendar.`;
  }
  if (schoolYearSource === 'settings' && schoolYear && settingsSchoolYear && schoolYear !== settingsSchoolYear) {
    return `You are working in ${schoolYear}, but teachers see ${settingsSchoolYear}. `
      + 'Sections and teaching load created now will not appear for teachers until the System Settings year is changed.';
  }
  return '';
};

const SchoolYearNotice = ({ schoolYear, settingsSchoolYear, schoolYearSource, id }) => {
  const text = schoolYearNoticeText({ schoolYear, settingsSchoolYear, schoolYearSource });
  if (!text) return null;
  return <div className="form-hint" role="status" id={id} style={WARNING_STYLE}>{text}</div>;
};

export default SchoolYearNotice;
