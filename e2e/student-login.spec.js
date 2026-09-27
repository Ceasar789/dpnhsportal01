// The student sign-in form at /student-login.
//
// The audit found the two fields had no label association and no autocomplete,
// the show/hide toggle was an unlabelled 20x20 target, a failed login was never
// announced, and five colour pairs sat under 4.5:1. The design is unchanged;
// these are the defects.
import { test, expect } from '@playwright/test';

// sRGB relative luminance, WCAG 2.1 formula. Takes "rgb(r, g, b)".
const CONTRAST = `(fg, bg) => {
  const parse = (s) => s.match(/[0-9.]+/g).slice(0, 3).map(Number);
  const lum = (c) => {
    const [r, g, b] = parse(c).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = lum(fg), b2 = lum(bg);
  const [hi, lo] = a > b2 ? [a, b2] : [b2, a];
  return (hi + 0.05) / (lo + 0.05);
}`;

test.describe('student login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/student-login');
    await page.waitForLoadState('networkidle');
  });

  test('both fields are reachable by their label, and autofillable', async ({ page }) => {
    const email = page.getByLabel('EMAIL ADDRESS');
    const password = page.locator('#student-password');
    await expect(email).toBeVisible();
    // getByLabel proves the label is associated; #id keeps it off the toggle.
    await expect(page.getByLabel('PASSWORD', { exact: true })).toHaveAttribute('id', 'student-password');
    await expect(email).toHaveAttribute('autocomplete', 'username');
    await expect(password).toHaveAttribute('autocomplete', 'current-password');
    // A password manager keys off name as well as autocomplete.
    await expect(email).toHaveAttribute('name', 'email');
    await expect(password).toHaveAttribute('name', 'password');
  });

  test('the show/hide toggle says what it does and what state it is in', async ({ page }) => {
    const toggle = page.getByRole('button', { name: 'Show password' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#student-password')).toHaveAttribute('type', 'password');

    await toggle.click();
    await expect(page.locator('#student-password')).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('every control clears the 24x24 minimum', async ({ page }) => {
    const names = ['Show password', 'Forgot password?', 'Sign In as Student', '← Back to role selection'];
    for (const name of names) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box, `${name} is missing`).not.toBeNull();
      expect(box.width, `${name} is ${box.width}px wide`).toBeGreaterThanOrEqual(24);
      expect(box.height, `${name} is ${box.height}px tall`).toBeGreaterThanOrEqual(24);
    }
  });

  test('a rejected login is announced, not just coloured', async ({ page }) => {
    // Empty submit is handled client-side, so it needs no network.
    await page.getByRole('button', { name: 'Sign In as Student' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Please fill in all fields');

    const ratio = await alert.locator('p').evaluate((el, fn) => {
      const contrast = eval(fn);
      return contrast(getComputedStyle(el).color, getComputedStyle(el.closest('[role=alert]')).backgroundColor);
    }, CONTRAST);
    expect(ratio, 'error text on its red panel').toBeGreaterThanOrEqual(4.5);
  });

  test('the text carries 4.5:1 against what it sits on', async ({ page }) => {
    // Each control against the first ancestor that actually paints a colour,
    // so the ratio is measured on what the eye sees, not on a transparent parent.
    const names = ['Forgot password?', 'Sign In as Student', '← Back to role selection'];
    const targets = [page.locator('label[for="student-email"]'),
      ...names.map((n) => page.getByRole('button', { name: n }))];

    for (const target of targets) {
      const [what, ratio] = await target.evaluate((el, fn) => {
        const contrast = eval(fn);
        const opaque = (c) => c && !c.startsWith('rgba(0, 0, 0, 0)');
        let bg = el, colour = getComputedStyle(el).backgroundColor;
        while (!opaque(colour) && bg.parentElement) {
          bg = bg.parentElement;
          colour = getComputedStyle(bg).backgroundColor;
        }
        return [el.textContent.trim(), contrast(getComputedStyle(el).color, colour)];
      }, CONTRAST);
      expect(ratio, `"${what}" reads at ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }

    // Placeholders are the pair the audit measured at 2.41:1.
    const ph = await page.evaluate((fn) => {
      const contrast = eval(fn);
      const el = document.querySelector('#student-email');
      const cls = el.className;
      const key = 'placeholder:text-[';
      const at = cls.indexOf(key);
      const hex = at === -1 ? null : cls.slice(at + key.length, cls.indexOf(']', at));
      if (!hex) return null;
      const rgb = 'rgb(' + [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',') + ')';
      return contrast(rgb, getComputedStyle(el).backgroundColor);
    }, CONTRAST);
    expect(ph, 'no placeholder colour declared on the email field').not.toBeNull();
    expect(ph, `placeholder reads at ${ph.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});
