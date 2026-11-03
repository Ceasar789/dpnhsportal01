import { JSDOM } from 'jsdom-lesson-plan';
import { parseManualIlawV2 } from '../../../frontend/src/pages/dashboards/teacher/ilaw/manualIlawV2.js';
import { validateWeeklySources } from './weeklyWorksheetGenerator.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const MAX_AI_HTML_BYTES = 128 * 1024;
const MAX_MANUAL_JSON_BYTES = 262144;
const MAX_SOURCE_DAYS_BYTES = 65536;
const FIELDS = [
  ['objective', 'ilaw-I', ['learning objective', 'learning objectives']],
  ['activity', 'ilaw-L', ['flow', 'learning activities', 'teaching activities']],
  ['assessment', 'ilaw-A', ['formative assessment', 'assessment', 'assessments']],
];
const BLOCKS = new Set(['BR', 'DIV', 'P', 'LI', 'UL', 'OL']);
const IGNORED = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'IFRAME']);

export class WeeklyDraftSourceError extends Error {
  constructor() {
    super('The saved lesson plan has no complete weekly source.');
    this.name = 'WeeklyDraftSourceError';
    this.code = 'invalid_weekly_source';
  }
}

const invalid = () => { throw new WeeklyDraftSourceError(); };
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const labelText = value => clean(value).toLowerCase().replace(/[:：]+$/, '');
const usable = value => clean(value).replace(/\[[^\]]*\]/g, '').replace(/[^\p{L}\p{N}]/gu, '').length >= 2
  && !/^(?:n\/?a|to be specified)$/i.test(clean(value));

// Read text only. Scripts and other embedded markup are never executed or used as source.
function textOf(node) {
  if (node?.nodeType === 3) return node.nodeValue;
  if (node?.nodeType !== 1 || IGNORED.has(node.tagName)) return '';
  const parts = [...node.childNodes].map(textOf).join('');
  return BLOCKS.has(node.tagName) ? ` ${parts} ` : parts;
}

const dayName = value => {
  const label = clean(value).toLowerCase().replace(/[.:'：]/g, '');
  return DAYS.find(day => day.toLowerCase() === label || day.slice(0, 3).toLowerCase() === label);
};
const cells = row => [...row.children].filter(node => node.tagName === 'TH' || node.tagName === 'TD');

function weekdayValues(table) {
  const rows = [...table.querySelectorAll('tr')];
  const headers = rows.filter(row => {
    const names = cells(row).map(cell => dayName(textOf(cell))).filter(Boolean);
    return names.length === 5 && new Set(names).size === 5;
  });
  if (headers.length === 1) {
    const header = headers[0];
    const columns = cells(header);
    const positions = Object.fromEntries(columns.flatMap((cell, index) => {
      const day = dayName(textOf(cell));
      return day ? [[day, index]] : [];
    }));
    const dataRows = rows.slice(rows.indexOf(header) + 1);
    if (rows[0] !== header || !dataRows.length ||
      dataRows.some(row => cells(row).length !== columns.length)) invalid();
    return Object.fromEntries(DAYS.map(day => [day,
      clean(dataRows.map(row => clean(textOf(cells(row)[positions[day]])))
        .filter(Boolean).join('; '))]));
  }
  if (headers.length || rows.length !== 5 || rows.some(row => cells(row).length !== 2)) invalid();
  const entries = rows.map(row => ({ day: dayName(textOf(cells(row)[0])),
    value: clean(textOf(cells(row)[1])) }));
  if (entries.some(entry => !entry.day) || new Set(entries.map(entry => entry.day)).size !== 5) invalid();
  return Object.fromEntries(entries.map(entry => [entry.day, entry.value]));
}

function aiDays(html) {
  const fragment = JSDOM.fragment(html);
  const roots = [...fragment.querySelectorAll('.ilaw-lesson-plan')];
  if (roots.length !== 1) invalid();
  const root = roots[0];
  const values = Object.fromEntries(DAYS.map(day => [day, { day }]));
  const intentionSections = [...fragment.querySelectorAll('.ilaw-section.ilaw-I')];
  if (intentionSections.length !== 1 || !root.contains(intentionSections[0])) invalid();
  const competencyFields = [...intentionSections[0].querySelectorAll('.ilaw-field')]
    .filter(field => labelText(textOf(field.querySelector('.ilaw-label'))) === 'learning competency');
  if (competencyFields.length > 1) invalid();
  if (competencyFields.length === 1) {
    const paragraphs = competencyFields[0].querySelectorAll('p');
    if (paragraphs.length !== 1) invalid();
    const competency = clean(textOf(paragraphs[0]));
    if (usable(competency)) DAYS.forEach(day => { values[day].competency = competency; });
  }

  for (const [key, sectionClass, aliases] of FIELDS) {
    const sections = [...fragment.querySelectorAll(`.ilaw-section.${sectionClass}`)];
    if (sections.length !== 1 || !root.contains(sections[0])) invalid();
    const fields = [...sections[0].querySelectorAll('.ilaw-field')]
      .filter(field => aliases.includes(labelText(textOf(field.querySelector('.ilaw-label')))));
    if (fields.length !== 1) invalid();
    const tables = fields[0].querySelectorAll('table');
    if (tables.length !== 1) invalid();
    const byDay = weekdayValues(tables[0]);
    for (const day of DAYS) {
      if (!usable(byDay[day])) invalid();
      values[day][key] = byDay[day];
    }
  }
  return DAYS.map(day => values[day]);
}

function manualDays(plan) {
  let manual;
  try { manual = parseManualIlawV2(plan.objectives, { teacherId: plan.teacher_id, planId: plan.id }); }
  catch { invalid(); }
  if (manual.workflowState !== 'saved' || manual.title !== plan.title ||
    manual.assignment.subjectId !== plan.subject_id ||
    manual.assignment.subjectName !== plan.subject ||
    manual.assignment.gradeLevel !== plan.grade_level) invalid();
  const document = manual.document;
  return DAYS.map(day => {
    const objective = document.weekly.learningObjectives[day];
    const activity = document.weekly.flow[day];
    const assessment = document.weekly.formativeAssessment[day];
    if (![objective, activity, assessment].every(usable)) invalid();
    return { day, objective: objective.trim(), activity: activity.trim(),
      assessment: assessment.trim(),
      ...(usable(document.learningCompetency) ? { competency: document.learningCompetency.trim() } : {}) };
  });
}

// plan is an already fetched, verified owned lesson_plans row. No browser days
// or database client enter this resolver; submit_v1 must still check the source.
export function resolveWeeklyDraftSourceDays(plan) {
  if (!plan || typeof plan.id !== 'string' || !plan.id ||
    typeof plan.teacher_id !== 'string' || !plan.teacher_id ||
    !['draft', 'published'].includes(plan.status) ||
    typeof plan.title !== 'string' || !plan.title.trim() ||
    typeof plan.subject !== 'string' || !plan.subject.trim() ||
    typeof plan.grade_level !== 'string' || !plan.grade_level.trim() ||
    typeof plan.objectives !== 'string' || !plan.objectives.trim()) invalid();
  const bytes = Buffer.byteLength(plan.objectives, 'utf8');
  if (bytes > (plan.ai_generated === true ? MAX_AI_HTML_BYTES : MAX_MANUAL_JSON_BYTES)) invalid();
  let days;
  try {
    if (plan.ai_generated === true) days = aiDays(plan.objectives);
    else if (plan.ai_generated === false) days = manualDays(plan);
    else invalid();
    days = validateWeeklySources(days);
  } catch { invalid(); }
  if (Buffer.byteLength(JSON.stringify(days), 'utf8') > MAX_SOURCE_DAYS_BYTES) invalid();
  return days;
}
