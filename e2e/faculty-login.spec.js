// The staff sign-in form at /faculty-login.
//
// The audit found the same eight defects the student form had, plus three of
// its own: a role list with no way out but choosing, a 30-second timeout that
// said "please wait" while re-enabling the button, and two role colours that
// read at 4.30:1 as text though they pass as a button background. The design
// is unchanged.
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

const ROLES = ['Admin', 'Teacher', 'Faculty', 'Registrar'];

test.describe('faculty login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/faculty-login');
    await page.waitForLoadState('networkidle');
  });

  test('both fields are reachable by their label, and autofillable', async ({ page }) => {
    const email = page.getByLabel('EMAIL ADDRESS');
    await expect(email).toBeVisible();
    await expect(page.getByLabel('PASSWORD', { exact: true })).toHaveAttribute('id', 'faculty-password');
    await expect(email).toHaveAttribute('autocomplete', 'username');
    await expect(page.locator('#faculty-password')).toHaveAttribute('autocomplete', 'current-password');
    await expect(email).toHaveAttribute('name', 'email');
    await expect(page.locator('#faculty-password')).toHaveAttribute('name', 'password');
  });

  test('the role control carries its own label and its open state', async ({ page }) => {
    // A <label> cannot name a <button>, so "LOGIN AS" has to reach it directly.
    const trigger = page.locator('#role-trigger');
    await expect(trigger).toHaveAccessibleName(/LOGIN AS/);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(ROLES.length);
  });

  test('the role list can be left without choosing a role', async ({ page }) => {
    const trigger = page.locator('#role-trigger');
    const list = page.getByRole('listbox');

    await trigger.click();
    await expect(list).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);

    await trigger.click();
    await expect(list).toBeVisible();
    // The list sits over the email field, so a click anywhere else must close it.
    await page.getByRole('heading', { name: 'Faculty Portal' }).click();
    await expect(list).toHaveCount(0);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  test('the page has one top-level heading', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Faculty Portal');
  });

  test('the show/hide toggle says what it does and what state it is in', async ({ page }) => {
    const toggle = page.getByRole('button', { name: 'Show password' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#faculty-password')).toHaveAttribute('type', 'password');

    await toggle.click();
    await expect(page.locator('#faculty-password')).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('every control clears the 24x24 minimum', async ({ page }) => {
    const targets = [
      page.getByRole('button', { name: 'Show password' }),
      page.getByRole('button', { name: /^Sign In/ }),
      page.getByRole('link', { name: 'Forgot password?' }),
      page.getByRole('link', { name: '← Back to role selection' }),
    ];
    for (const target of targets) {
      const name = await target.textContent();
      const box = await target.boundingBox();
      expect(box, `${name} is missing`).not.toBeNull();
      expect(box.width, `${name} is ${box.width}px wide`).toBeGreaterThanOrEqual(24);
      expect(box.height, `${name} is ${box.height}px tall`).toBeGreaterThanOrEqual(24);
    }
  });

  test('the two navigations are links, with their destination in the markup', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
    await expect(page.getByRole('link', { name: '← Back to role selection' })).toHaveAttribute('href', '/login');
  });

  test('a rejected sign-in is announced, not just coloured', async ({ page }) => {
    // No role chosen: handled client-side, so it needs no network.
    await page.getByRole('button', { name: /^Sign In/ }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Please select your role');

    const ratio = await alert.locator('p').evaluate((el, fn) => {
      const contrast = eval(fn);
      return contrast(getComputedStyle(el).color, getComputedStyle(el.closest('[role=alert]')).backgroundColor);
    }, CONTRAST);
    expect(ratio, 'error text on its red panel').toBeGreaterThanOrEqual(4.5);
  });

  test('every role name reads at 4.5:1 in the list and in the field', async ({ page }) => {
    await page.locator('#role-trigger').click();

    // In the open list, over white.
    for (const role of ROLES) {
      const ratio = await page.getByRole('option', { name: role }).locator('span').evaluate((el, fn) => {
        const contrast = eval(fn);
        const opaque = (c) => c && !c.startsWith('rgba(0, 0, 0, 0)');
        let bg = el, colour = getComputedStyle(el).backgroundColor;
        while (!opaque(colour) && bg.parentElement) {
          bg = bg.parentElement;
          colour = getComputedStyle(bg).backgroundColor;
        }
        return contrast(getComputedStyle(el).color, colour);
      }, CONTRAST);
      expect(ratio, `"${role}" in the list reads at ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
    await page.keyboard.press('Escape');

    // Once chosen, the same colour becomes text on the grey field and the
    // background of the submit button. Both have to hold.
    for (const role of ROLES) {
      await page.locator('#role-trigger').click();
      await page.getByRole('option', { name: role }).click();

      const inField = await page.locator('#role-trigger span.font-semibold').evaluate((el, fn) => {
        const contrast = eval(fn);
        return contrast(getComputedStyle(el).color, getComputedStyle(el.closest('button')).backgroundColor);
      }, CONTRAST);
      expect(inField, `"${role}" in the field reads at ${inField.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);

      const onButton = await page.getByRole('button', { name: `Sign In as ${role}` }).evaluate((el, fn) => {
        const contrast = eval(fn);
        return contrast(getComputedStyle(el).color, getComputedStyle(el).backgroundColor);
      }, CONTRAST);
      expect(onButton, `"Sign In as ${role}" reads at ${onButton.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('the rest of the text carries 4.5:1 against what it sits on', async ({ page }) => {
    const targets = [
      page.locator('label[for="faculty-email"]'),
      page.getByRole('link', { name: 'Forgot password?' }),
      page.getByRole('link', { name: '← Back to role selection' }),
    ];
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

    // Chrome will not resolve ::placeholder through getComputedStyle, so read
    // the declared colour off the utility class and measure it against the
    // field background as rendered.
    const ph = await page.evaluate((fn) => {
      const contrast = eval(fn);
      const el = document.querySelector('#faculty-email');
      const key = 'placeholder:text-[';
      const at = el.className.indexOf(key);
      if (at === -1) return null;
      const hex = el.className.slice(at + key.length, el.className.indexOf(']', at));
      const rgb = 'rgb(' + [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',') + ')';
      return contrast(rgb, getComputedStyle(el).backgroundColor);
    }, CONTRAST);
    expect(ph, 'no placeholder colour declared on the email field').not.toBeNull();
    expect(ph, `placeholder reads at ${ph && ph.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});
