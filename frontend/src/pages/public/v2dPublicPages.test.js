// V2d: public pages never widen the phone screen (320px and 200% text): the
// Calendar month row, the News header and the Login role buttons wrap; the
// Calendar arrows are 44px targets. Pinned on the source; the browser run
// measures the overflow (0 rows after V2d; +36/+223/+14/+19px before).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = rel => readFileSync(join(here, rel), 'utf8').replace(/\r\n/g, '\n');

describe('V2d public pages on phones', () => {
  it('Calendar: the month row wraps and the arrows are 44px', () => {
    const src = read('Calendar.jsx');
    expect(src).toMatch(/<div className="flex flex-wrap items-center gap-2 sm:gap-3 max-w-full">\n\s*<button type="button" onClick=\{prevMonth\}/);
    const arrows = src.match(/onClick=\{(prevMonth|nextMonth)\} aria-label="(Previous|Next) month" className="([^"]+)"/g);
    expect(arrows).toHaveLength(2);
    for (const a of arrows) expect(a).toContain('min-w-11 min-h-11 inline-flex items-center justify-center');
  });
  it('News: both section headers wrap', () => {
    expect(read('News.jsx').match(/<div className="flex flex-wrap justify-between items-end gap-3 mb-6 lg:mb-10">/g)).toHaveLength(2);
  });
  it('Login: the Student and Faculty buttons may stack', () => {
    expect(read('Login.jsx')).toContain('<div className="mt-5 flex flex-wrap w-full max-w-[280px] gap-3">');
  });
});
