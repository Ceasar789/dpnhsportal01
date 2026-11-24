// R22 (4k): a lesson plan as Word blocks for lib/docx.js. Text only, from the
// saved plan: an AI plan's sanitized HTML (headings, paragraphs, lists,
// tables) or a Manual ILAW plan's fields. Nothing is added that the plan
// does not contain, except the field labels of the ILAW template.
import { sanitizeLessonPlanHtml } from '../lessonPlanHtml';
import { parseManualIlawV2 } from '../ilaw/manualIlawV2';
import { savedPlanType } from './savedPlanType';
import { WEEKDAYS, WEEKLY_FIELDS } from '../ilaw/ilawTemplateModel';

const clean = value => String(value ?? '').replace(/[ \t\r\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

export function blocksFromHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = sanitizeLessonPlanHtml(html || '');
  const blocks = [];
  const walk = (node) => {
    for (const element of node.children) {
      const tag = element.tagName.toLowerCase();
      if (tag === 'table') {
        const rows = [...element.querySelectorAll('tr')].map(row => [...row.children].map(cell => clean(cell.textContent)))
          .filter(row => row.some(Boolean));
        if (rows.length) blocks.push({ table: rows });
      } else if (/^h[1-6]$/.test(tag)) {
        const text = clean(element.textContent);
        if (text) blocks.push({ heading: Math.min(3, Number(tag[1])), text });
      } else if (['p', 'li', 'pre', 'blockquote'].includes(tag) || !element.children.length) {
        const text = clean(element.textContent);
        if (text) blocks.push({ text: tag === 'li' ? `• ${text}` : text });
      } else {
        walk(element);
      }
    }
  };
  walk(template.content);
  return blocks;
}

const INFO_LABELS = [['nameOfLesson', 'Name of Lesson'], ['teachingDate', 'Teaching Date'], ['learningArea', 'Learning Area/s'],
  ['termWeek', 'Term No. and Week No.'], ['designedBy', 'Designed by'], ['gradeSection', 'Grade/Section'],
  ['sessions', 'Sessions'], ['references', 'References'], ['aiUseDeclaration', 'AI Use Declaration']];

export function blocksFromManual(document) {
  const info = document?.info || {};
  const blocks = [{ table: INFO_LABELS.filter(([key]) => clean(info[key])).map(([key, label]) => [label, clean(info[key])]) }];
  if (clean(document?.learningCompetency)) blocks.push({ heading: 3, text: 'Learning Competency' }, { text: clean(document.learningCompetency) });
  const rows = WEEKLY_FIELDS.map(([key, label]) => [label, ...WEEKDAYS.map(day => clean(document?.weekly?.[key]?.[day]))])
    .filter(row => row.slice(1).some(Boolean));
  if (rows.length) blocks.push({ table: [['', ...WEEKDAYS], ...rows] });
  for (const [key, label] of [['preparedBy', 'Prepared by'], ['checkedBy', 'Checked by'], ['notedBy', 'Noted by']]) {
    const person = document?.signatures?.[key];
    if (clean(person?.name)) blocks.push({ text: `${label}: ${clean(person.name)}${clean(person.role) ? `, ${clean(person.role)}` : ''}` });
  }
  return blocks.filter(block => !block.table || block.table.length);
}

export function lessonPlanDocxBlocks(plan) {
  const title = clean(plan?.title) || 'ILAW Lesson Plan';
  const head = [{ heading: 1, text: title }];
  const line = [clean(plan?.subject), clean(plan?.grade_level)].filter(Boolean).join(' · ');
  if (line) head.push({ text: line });
  if (savedPlanType(plan) === 'manual') {
    const parsed = parseManualIlawV2(plan.objectives, { teacherId: plan.teacher_id, planId: plan.id });
    return [...head, ...blocksFromManual(parsed.document)];
  }
  return [...head, ...blocksFromHtml(plan?.objectives)];
}
