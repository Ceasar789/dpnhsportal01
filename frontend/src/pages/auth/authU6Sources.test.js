// U6 source pins for the sign-in pages (presentation only): 16px inputs and
// 44px targets on every auth page, the Login small print readable.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = rel => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');

describe('U6 sign-in, forgot password: 16px inputs, 44px targets', () => {
  it.each(['pages/auth/StudentLogin.jsx', 'pages/auth/FacultyLogin.jsx', 'pages/auth/ForgotPassword.jsx'])('%s', (file) => {
    const text = src(file);
    expect(text).not.toMatch(/rounded-md text-sm outline-none/);
    expect(text).not.toMatch(/className="text-sm( font-semibold)? py-1\.5/);
    expect(text).not.toMatch(/max-md:min-w-10|p-1 rounded max-md/);
    expect(text.split('inline-flex items-center min-h-11').length - 1).toBeGreaterThanOrEqual(1);
  });
  it.each(['pages/auth/StudentLogin.jsx', 'pages/auth/FacultyLogin.jsx'])('%s: the show/hide button is 44px at every size', (file) => {
    expect(src(file)).toContain('inline-flex items-center justify-center min-w-11 min-h-11 rounded');
  });
  it('the consent row is 44px', () => {
    expect(src('components/auth/ConsentCheckbox.jsx')).toContain('className="flex min-h-11 cursor-pointer');
  });
  it('Login: 44px role buttons and icon links, 14px small print', () => {
    const text = src('pages/public/Login.jsx');
    expect(text).toContain('flex-1 min-h-11 rounded-lg');
    expect(text).toContain('flex h-11 w-11 items-center');
    expect(text).toContain('<p className="mt-6 max-w-sm text-sm leading-relaxed text-white/85">');
  });
});
