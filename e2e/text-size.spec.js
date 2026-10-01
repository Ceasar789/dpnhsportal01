// Rendered text size, measured in the browser.
//
// The audit counted "31 instances under 12px" from a grep that only saw
// Tailwind's text-[Npx] classes and missed every inline fontSize. The real
// figure was 65. Measuring what the browser actually paints removes the
// counting problem entirely.
//
// The floor asserted here is 11px, not 12px, and that is deliberate. WCAG
// sets no minimum font size; 12px is a convention. The 9px and 10px text was
// raised because it was genuinely hard to read — a 9px unread count is about
// half the height of body text — but 44 remaining call sites at 11px are a
// visual decision for whoever owns the design, not an accessibility failure
// to fix unilaterally. If those are raised later, raise this floor with them.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { login, STUDENT, TEACHER, STUDENT_LOGIN, STAFF_LOGIN } from './helpers.js';

const FLOOR = 11;

// Every visible element that directly holds text, with its computed size.
const smallest = (page) =>
  page.evaluate((floor) => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.offsetParent === null && el.tagName !== 'BODY') continue;
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3 && n.textContent.trim())
        .map((n) => n.textContent.trim())
        .join(' ');
      if (!own) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < floor) out.push(`${size}px  "${own.slice(0, 40)}"  <${el.tagName.toLowerCase()}>`);
    }
    return out;
  }, FLOOR);

// Like the icon-button suite, this first check passed before the repair too:
// the public pages had nothing under 11px. It guards the next regression; the
// three below it are the ones that went red to green.
test('no public page paints text below the floor', async ({ page }) => {
  for (const path of ['/', '/news', '/calendar', '/login', '/student-login', '/faculty-login',
    '/forgot-password', '/verify-email']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await smallest(page), `${path} paints text under ${FLOOR}px`).toEqual([]);
  }
});

test('the student dashboard paints nothing below the floor', async ({ page }) => {
  await login(page, STUDENT, STUDENT_LOGIN, '/student-dashboard');
  for (const path of ['', 'tasks', 'attendance', 'announcements']) {
    await page.goto(`/student-dashboard/${path}`);
    await page.waitForLoadState('networkidle');
    expect(await smallest(page), `student /${path} paints text under ${FLOOR}px`).toEqual([]);
  }
});

test('the teacher dashboard paints nothing below the floor', async ({ page }) => {
  await login(page, TEACHER, STAFF_LOGIN, '/teacher-dashboard', 'Teacher');
  for (const path of ['', 'worksheets', 'lesson-plans', 'students', 'attendance']) {
    await page.goto(`/teacher-dashboard/${path}`);
    await page.waitForLoadState('networkidle');
    expect(await smallest(page), `teacher /${path} paints text under ${FLOOR}px`).toEqual([]);
  }
});

test('the unread count is legible', async ({ page }) => {
  await login(page, STUDENT, STUDENT_LOGIN, '/student-dashboard');
  await page.waitForLoadState('networkidle');

  // The badge only renders when something is unread, and no seeded account
  // has an unread notification — so waiting for one would make this skip
  // forever, which is a failure that looks like a pass. Instead the class
  // list is read out of the component and rendered against the real built
  // stylesheet. It measures the styling, which is what changed; it does not
  // claim the count itself was exercised.
  const src = fs.readFileSync('frontend/src/components/NotificationBell.jsx', 'utf8');
  const cls = (src.match(/className="(absolute top-0[^"]*)"/) || [])[1];
  expect(cls, 'could not find the badge className in NotificationBell.jsx').toBeTruthy();

  await page.evaluate(([c]) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:relative;background:#003b7a;width:60px;height:40px';
    host.innerHTML = `<span data-probe class="${c}">9+</span>`;
    document.body.appendChild(host);
  }, [cls]);

  const badge = page.locator('[data-probe]');
  const seen = await badge.evaluate((el) => {
    const parse = (s) => s.match(/[0-9.]+/g).slice(0, 3).map(Number);
    const lum = (c) => {
      const [r, g, b] = parse(c).map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const cs = getComputedStyle(el);
    const a = lum(cs.color), b = lum(cs.backgroundColor);
    const [hi, lo] = a > b ? [a, b] : [b, a];
    const box = el.getBoundingClientRect();
    return { ratio: (hi + 0.05) / (lo + 0.05), size: parseFloat(cs.fontSize), w: box.width, h: box.height };
  });

  // It used to fail twice over: 9px text at 3.76:1 on bg-red-500.
  expect(seen.ratio, `the unread count reads at ${seen.ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  expect(seen.size, 'the unread count is tiny').toBeGreaterThanOrEqual(12);
  // "9+" has to still fit once the digits grew.
  expect(seen.w, 'the badge is narrower than its own text').toBeGreaterThanOrEqual(16);
  expect(seen.h).toBeGreaterThanOrEqual(16);
});
