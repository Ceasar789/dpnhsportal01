import { sanitizeLessonPlanHtml } from '../lessonPlanHtml';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const clean = value => (value || '').replace(/\s+/g, ' ').trim();
const usable = value => clean(value).replace(/\[[^\]]*\]/g, '').replace(/[^\p{L}\p{N}]/gu, '').length >= 8;

// Extracts source material, not questions. The trusted writer must repeat this
// extraction from the owned saved row; browser-supplied context is not proof.
export function extractAiAssessmentContext(html) {
  const template = document.createElement('template');
  template.innerHTML = sanitizeLessonPlanHtml(html || '');
  const root = template.content;
  root.querySelectorAll('.ilaw-letterhead, .ilaw-info-table, .ilaw-signatures, img, svg').forEach(node => node.remove());

  const assessment = root.querySelector('.ilaw-A') || [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .find(node => /^\s*(?:a\s*[—–-]\s*)?assessment\b/i.test(clean(node.textContent)));
  if (!assessment) return null;
  const weekdayFormativeAssessments = {};
  const activities = [];
  const container = assessment.classList?.contains('ilaw-A') ? assessment : assessment.parentElement;
  const candidates = assessment.classList?.contains('ilaw-A')
    ? [...container.querySelectorAll('.ilaw-field')]
    : [...(function* () {
      for (let node = assessment.nextElementSibling; node && !/^H[1-6]$/.test(node.tagName); node = node.nextElementSibling) yield node;
    })()];
  for (const candidate of candidates) {
    const label = clean(candidate.querySelector?.('.ilaw-label')?.textContent);
    if (label && !/assessment|task|activity|instruction/i.test(label)) continue;
    const copy = candidate.cloneNode(true);
    copy.querySelectorAll?.('.ilaw-label, .ilaw-label-hint').forEach(node => node.remove());
    for (const table of copy.querySelectorAll?.('table') || []) {
      const rows = [...table.querySelectorAll('tr')];
      const heading = rows.find(row => [...row.children].some(cell => DAYS.includes(clean(cell.textContent))));
      if (heading) {
        const labels = [...heading.children].map(cell => clean(cell.textContent));
        for (const row of rows.slice(rows.indexOf(heading) + 1)) {
          [...row.children].forEach((cell, index) => {
            const day = labels[index];
            const value = clean(cell.textContent);
            if (DAYS.includes(day) && usable(value)) {
              weekdayFormativeAssessments[day] = [weekdayFormativeAssessments[day], value].filter(Boolean).join(' ');
            }
          });
        }
        table.remove();
      }
    }
    const value = clean(copy.textContent).replace(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday)\b/g, '').trim();
    if (usable(value)) activities.push(value);
  }
  if (assessment.classList?.contains('ilaw-A') && candidates.length === 0) {
    const value = clean(assessment.textContent).replace(/^A\s*[—–-]?\s*Assessment\s*/i, '');
    if (usable(value)) activities.push(value);
  }
  const orderedDays = DAYS.filter(day => weekdayFormativeAssessments[day]);
  if (!activities.length && !orderedDays.length) return null;
  return { activities, weekdayFormativeAssessments: Object.fromEntries(orderedDays.map(day =>
    [day, weekdayFormativeAssessments[day]])) };
}
