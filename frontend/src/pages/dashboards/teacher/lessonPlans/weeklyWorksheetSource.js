import { sanitizeLessonPlanHtml } from '../lessonPlanHtml';

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const FIELDS = [
  ['objective', '.ilaw-I', 'Learning Objectives', ['learning objective', 'learning objectives']],
  ['activity', '.ilaw-L', 'Flow', ['flow', 'learning activities', 'teaching activities']],
  ['assessment', '.ilaw-A', 'Formative Assessment', ['formative assessment', 'assessment', 'assessments']],
];
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const labelText = value => clean(value).toLowerCase().replace(/[:：]+$/, '');
const usable = value => clean(value).replace(/\[[^\]]*\]/g, '').replace(/[^\p{L}\p{N}]/gu, '').length >= 2
  && !/^(?:n\/?a|to be specified)$/i.test(clean(value));
const dayName = value => {
  const normalized = clean(value).toLowerCase().replace(/[.:'：]/g, '');
  return WEEKDAYS.find(day => day.toLowerCase() === normalized || day.slice(0, 3).toLowerCase() === normalized);
};
const cells = row => [...row.children].filter(node => /^(TH|TD)$/.test(node.tagName));

function weekdayValues(table) {
  const rows = [...table.querySelectorAll('tr')];
  const horizontal = rows.filter(row => {
    const names = cells(row).map(cell => dayName(cell.textContent)).filter(Boolean);
    return names.length === 5 && new Set(names).size === 5;
  });
  if (horizontal.length === 1) {
    const header = horizontal[0];
    const positions = Object.fromEntries(cells(header).flatMap((cell, index) => {
      const day = dayName(cell.textContent);
      return day ? [[day, index]] : [];
    }));
    const dataRows = rows.slice(rows.indexOf(header) + 1).filter(row => cells(row).length > Math.max(...Object.values(positions)));
    if (dataRows.length) return Object.fromEntries(WEEKDAYS.map(day => [day,
      clean(dataRows.map(row => clean(cells(row)[positions[day]].textContent)).filter(Boolean).join('; '))]));
  }
  if (horizontal.length) return null;
  const vertical = rows.map(row => ({ day: dayName(cells(row)[0]?.textContent), value: clean(cells(row)[1]?.textContent) }))
    .filter(row => row.day);
  return vertical.length === 5 && new Set(vertical.map(row => row.day)).size === 5
    ? Object.fromEntries(vertical.map(row => [row.day, row.value])) : null;
}

// AI HTML is untrusted. Read only the named ILAW fields and exact weekday columns.
export function extractWeeklyWorksheetSource(html) {
  const template = document.createElement('template');
  template.innerHTML = sanitizeLessonPlanHtml(html || '');
  const values = Object.fromEntries(WEEKDAYS.map(day => [day, { day }]));
  const issues = [];
  const sourceInfo = {};
  for (const row of template.content.querySelectorAll('.ilaw-info-table tr')) {
    [...row.querySelectorAll('th')].forEach(heading => {
      const label = clean(heading.textContent).toLowerCase();
      const value = clean(heading.nextElementSibling?.textContent);
      if (!value || /to be specified|^\[/.test(value.toLowerCase())) return;
      if (label === 'term no. and week no.') sourceInfo.sourceWeek = value;
      if (label === 'teaching date') sourceInfo.teachingDate = value;
    });
  }

  const competencyFields = [...template.content.querySelectorAll('.ilaw-I .ilaw-field')]
    .filter(field => labelText(field.querySelector('.ilaw-label')?.textContent) === 'learning competency');
  const competency = competencyFields.length === 1 ? clean(competencyFields[0].querySelector('p')?.textContent) : '';
  if (usable(competency)) WEEKDAYS.forEach(day => { values[day].competency = competency; });

  for (const [key, sectionSelector, label, aliases] of FIELDS) {
    const fields = [...template.content.querySelectorAll(`${sectionSelector} .ilaw-field`)]
      .filter(field => aliases.includes(labelText(field.querySelector('.ilaw-label')?.textContent)));
    if (fields.length !== 1) {
      issues.push({ field: key, day: null, code: fields.length ? 'ambiguous' : 'missing',
        message: `${label} must appear once in the weekly ILAW.` });
      continue;
    }
    const tables = fields[0].querySelectorAll('table');
    const valuesByDay = tables.length === 1 ? weekdayValues(tables[0]) : null;
    if (!valuesByDay) {
      issues.push({ field: key, day: null, code: 'ambiguous', message: `${label} needs one value per weekday.` });
      continue;
    }
    WEEKDAYS.forEach(day => {
      const value = valuesByDay[day];
      if (usable(value)) values[day][key] = value;
      else issues.push({ field: key, day, code: 'missing', message: `${day} ${label.toLowerCase()} is missing.` });
    });
  }
  return { days: WEEKDAYS.map(day => values[day]), issues, ...sourceInfo };
}
