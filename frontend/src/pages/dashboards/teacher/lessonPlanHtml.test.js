// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { escapeLessonPlanTitle, sanitizeLessonPlanHtml, syncAiLessonPlanHeading } from './lessonPlanHtml';

describe('Teacher lesson-plan HTML boundary', () => {
  it('renames only the identifiable AI heading and preserves other content', () => {
    const original = '<div class="ilaw-lesson-plan"><h2 class="ilaw-title">ILAW LESSON PLAN IN ENGLISH 7</h2><h2>Objectives</h2><p>Identify &amp; compare</p><h3>Activities</h3><table><tbody><tr><td>Assessment</td></tr></tbody></table></div>';
    const html = syncAiLessonPlanHeading(original, '7 English');
    const root = document.createElement('div');
    root.innerHTML = html;
    expect(root.querySelectorAll('h2.ilaw-title')).toHaveLength(1);
    expect(root.querySelector('h2.ilaw-title').textContent).toBe('7 English');
    expect(root.querySelectorAll('h2')[1].textContent).toBe('Objectives');
    expect(root.querySelector('p').textContent).toBe('Identify & compare');
    expect(root.querySelector('h3').textContent).toBe('Activities');
    expect(root.querySelector('table td').textContent).toBe('Assessment');
    expect(syncAiLessonPlanHeading(html, '7 <English> & "Class"')).toContain('7 &lt;English&gt; &amp; "Class"');
    expect(syncAiLessonPlanHeading(html, '7 <English> & "Class"')).not.toContain('<English>');
    expect(syncAiLessonPlanHeading('<h2>ILAW Lesson Plan in English 7</h2><p>Legacy</p>', '7 English')).toContain('class="ilaw-title">7 English</h2>');
  });

  it('does not guess when a title heading is missing or ambiguous', () => {
    expect(syncAiLessonPlanHeading('<h2>Objectives</h2>', '7 English')).toBeNull();
    expect(syncAiLessonPlanHeading('<h2 class="ilaw-title">One</h2><h2 class="ilaw-title">Two</h2>', '7 English')).toBeNull();
    expect(syncAiLessonPlanHeading('<h2>ILAW Lesson Plan in English 7</h2><h2>ILAW Lesson Plan in Math 7</h2>', '7 English')).toBeNull();
  });
  it('preserves the actual ILAW prompt structure and approved formatting', () => {
    const prompt = readFileSync('../backend/src/lib/ilaw-prompt.txt', 'utf8');
    const html = sanitizeLessonPlanHtml(`${prompt}
      <table><tr><th rowspan="2">Two days</th><td>Day one</td></tr></table>
      <ul><li><strong>Bold</strong> <em>Italic</em> <u>Underline</u></li></ul>
      <a href="https://example.edu/resource">Resource</a>`);
    const container = document.createElement('div');
    container.innerHTML = html;
    const source = document.createElement('div');
    source.innerHTML = prompt;
    const requiredClasses = new Set([...source.querySelectorAll('[class]')].flatMap(element => [...element.classList]));
    const retainedClasses = new Set([...container.querySelectorAll('[class]')].flatMap(element => [...element.classList]));
    requiredClasses.forEach(name => expect(retainedClasses.has(name), `ILAW class ${name}`).toBe(true));
    expect(container.querySelector('.ilaw-lesson-plan')).not.toBeNull();
    expect(container.querySelector('.ilaw-week-table th')).not.toBeNull();
    expect(container.querySelector('td[colspan="3"]')).not.toBeNull();
    expect(container.querySelector('th[rowspan="2"]')).not.toBeNull();
    expect(container.querySelector('h2.ilaw-title')).not.toBeNull();
    expect(container.querySelector('ul li strong')).not.toBeNull();
    expect(container.querySelector('em')).not.toBeNull();
    expect(container.querySelector('u')).not.toBeNull();
    expect(container.querySelector('a[href="https://example.edu/resource"]')).not.toBeNull();
    expect(container.querySelector('[style]')).toBeNull();
  });

  it('removes scripts, handlers, unsafe URLs, foreign content, embeds, and styles', () => {
    const html = sanitizeLessonPlanHtml(`
      <h2 class="ilaw-title fixed inset-0 z-50" onclick="alert(1)">Lesson</h2><script>alert(1)</script>
      <a href="javascript:alert(1)">Bad link</a>
      <a href="data:text/html,<script>alert(1)</script>">Bad data link</a>
      <a href="https://example.edu/lesson">Good link</a>
      <svg onload="alert(1)"><circle /></svg><math><mi>x</mi></math>
      <iframe src="https://example.edu"></iframe><object data="https://example.edu"></object>
      <embed src="https://example.edu"><style>body{display:none}</style>
      <p style="background:url(https://example.edu/track)" onmouseover="alert(1)">Safe text</p>
    `);
    const container = document.createElement('div');
    container.innerHTML = html;
    expect(container.querySelector('script, svg, math, iframe, object, embed, style')).toBeNull();
    expect(container.querySelector('[style], [onclick], [onmouseover]')).toBeNull();
    expect(container.querySelector('h2')?.className).toBe('ilaw-title');
    expect([...container.querySelectorAll('a')].slice(0, 2).every(link => !link.hasAttribute('href'))).toBe(true);
    expect(container.querySelector('a[href="https://example.edu/lesson"]')).not.toBeNull();
    expect(container.textContent).toContain('Lesson');
    expect(container.textContent).toContain('Safe text');
  });

  it('is idempotent and escapes document-title text independently', () => {
    const once = sanitizeLessonPlanHtml('<p class="ilaw-field">A &amp; B</p><img src=x onerror=alert(1)>');
    expect(sanitizeLessonPlanHtml(once)).toBe(once);
    const title = escapeLessonPlanTitle('</title><script>alert(1)</script> & "Class"');
    const doc = document.implementation.createHTMLDocument('');
    doc.head.innerHTML = `<title>${title}</title>`;
    expect(doc.querySelector('head script')).toBeNull();
    expect(doc.title).toBe('</title><script>alert(1)</script> & "Class"');
  });
});
