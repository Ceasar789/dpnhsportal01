// X2 pin: the school offers Grades 7-10 only, so no student or public page may
// mention Grade 11, Grade 12 or Senior High. Scans the source text of the
// student and public sources (tests and this check's own file excluded; the
// archived docs are outside src and are not scanned).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = import.meta.dirname;
const ROOTS = [
  'pages/public', 'pages/about', 'pages/auth', 'pages/dashboards/student', 'components/clarity/student',
  'components/PublicFooter.jsx', 'components/PublicHeader.jsx', 'components/SignInChooser.jsx',
];
const SHS = /grade\s*1[12]\b|\bG1[12]\b|senior\s*high|\bSHS\b/i;

const files = (path) => {
  const full = join(SRC, path);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full).flatMap(name => files(join(path, name)));
};
const sources = ROOTS.flatMap(files)
  .filter(f => /\.(jsx?|css)$/.test(f) && !/\.test\.jsx?$/.test(f));

describe('student and public sources', () => {
  it('cover a real set of files', () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  it('never mention Grade 11, Grade 12 or Senior High', () => {
    const hits = sources.flatMap(f => readFileSync(f, 'utf8').split('\n')
      .map((line, i) => (SHS.test(line) ? `${relative(SRC, f)}:${i + 1}: ${line.trim()}` : null)).filter(Boolean));
    expect(hits).toEqual([]);
  });
});
