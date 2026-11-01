import createDOMPurify from 'dompurify';

let purifier;
const ILAW_CLASSES = new Set([
  'ilaw-lesson-plan', 'ilaw-letterhead', 'ilaw-school-name', 'ilaw-school-address',
  'ilaw-title', 'ilaw-info-table', 'ilaw-section', 'ilaw-I', 'ilaw-L', 'ilaw-A',
  'ilaw-W', 'ilaw-section-header', 'ilaw-section-intro', 'ilaw-field', 'ilaw-label',
  'ilaw-label-hint', 'ilaw-week-table', 'ilaw-signatures', 'ilaw-sig-row',
  'ilaw-sig-col', 'ilaw-sig-tag', 'ilaw-sig-name', 'ilaw-sig-position',
  'ilaw-sig-noted', 'ilaw-empty-placeholder',
]);

// Arbitrary utility classes could make generated content cover or impersonate
// the surrounding UI. Only the classes required by the existing ILAW template
// and editor placeholder are allowed through DOMPurify's attribute hook.
const getPurifier = () => {
  if (!purifier) {
    // Lazy initialization keeps server-rendered dashboard imports DOM-free.
    purifier = createDOMPurify(window);
    purifier.addHook('uponSanitizeAttribute', (_node, data) => {
      if (data.attrName !== 'class') return;
      const classes = data.attrValue.split(' ').filter(name => ILAW_CLASSES.has(name));
      if (classes.length) data.attrValue = classes.join(' ');
      else data.keepAttr = false;
    });
  }
  return purifier;
};

// Keep the ILAW tables and ordinary rich-text edits, but never carry executable
// markup or inline CSS from AI output, stored plans, or clipboard HTML.
const LESSON_PLAN_HTML_POLICY = {
  ALLOWED_TAGS: [
    'a', 'b', 'blockquote', 'br', 'col', 'colgroup', 'div', 'em', 'h1', 'h2',
    'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'li', 'ol', 'p', 'span', 'strong',
    'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
  ],
  ALLOWED_ATTR: ['class', 'colspan', 'href', 'rowspan', 'title'],
  FORBID_TAGS: ['style'],
  FORBID_ATTR: ['style'],
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
};

export const sanitizeLessonPlanHtml = value =>
  getPurifier().sanitize(typeof value === 'string' ? value : '', LESSON_PLAN_HTML_POLICY);

// AI plans have one document title in the generated template. Legacy plans may
// have the same heading without the template class; never guess among matches.
export const syncAiLessonPlanHeading = (html, title) => {
  const template = document.createElement('template');
  template.innerHTML = sanitizeLessonPlanHtml(html);
  const marked = [...template.content.querySelectorAll('h2.ilaw-title')];
  const headings = marked.length ? marked : [...template.content.querySelectorAll('h2')]
    .filter(node => /^ILAW\s+LESSON\s+PLAN\s+IN\b/i.test(node.textContent.trim()));
  if (headings.length !== 1 || marked.length > 1) return null;
  headings[0].classList.add('ilaw-title');
  headings[0].textContent = title;
  return sanitizeLessonPlanHtml(template.innerHTML);
};

// The Word document title is text in a different HTML context from the body.
export const escapeLessonPlanTitle = value => {
  const element = document.createElement('span');
  element.textContent = String(value ?? '');
  return element.innerHTML;
};
