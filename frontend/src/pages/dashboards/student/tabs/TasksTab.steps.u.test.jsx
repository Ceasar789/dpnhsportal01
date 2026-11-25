// @vitest-environment jsdom
// U-PDF-S3: the open task's Assigned / Turned in / Marked steps (Clarity only).
// One colour (the primary token): done = filled circle with a check, in progress
// = ring with a clock and a bold label, upcoming = neutral ring, no icon. The
// state is also text for screen readers; "Waiting for your teacher" shows only
// while a turned-in task is not marked. aria-current is unchanged.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const state = vi.hoisted(() => ({ graph: null }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1', name: 'Sample Student' } }) }));
vi.mock('../StudentDataContext', () => ({ useStudentData: () => ({ graph: state.graph, loading: false, refresh: vi.fn() }) }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../../config/supabase', () => ({ supabase: { from(table) {
  const q = new Proxy({}, { get: (_, prop) => {
    if (prop === 'then') {
      const data = table === 'worksheet_items' ? [{ id: 'i1', position: 0, question: 'Question 1', item_type: 'identification', options: null, points: 1 }]
        : table === 'worksheets' ? null : [];
      return (ok, bad) => Promise.resolve({ data, error: null }).then(ok, bad);
    }
    return () => q;
  } });
  return q;
} } }));

import StudentTasksTab from './TasksTab';

const SUBMISSIONS = {
  assigned: { id: 's-a', status: 'in_progress', released: false },
  waiting: { id: 's-w', status: 'submitted', released: false },
  marked: { id: 's-m', status: 'checked', released: true, score: 1, total_points: 1 },
};
beforeEach(() => {
  const sheet = { id: 'w1', title: 'Task one', subject: 'English', subject_id: 'eng', task_type: 'quiz', items: 1, instructions: 'Answer.', checking_mode: 'manual', max_points: 1 };
  state.graph = {
    fatalError: null,
    enrolments: [{ section_id: 's1', sections: { name: 'Rizal', grade_level: '8', school_year: '2026-2027' } }],
    assignees: [{ task_id: 'w1', section_id: 's1', assigned_at: '2026-11-18T08:00:00', due_at: '2099-11-28T17:00:00' }],
    sheetById: new Map([['w1', sheet]]),
    submissionStates: [], releasedScores: [],
    subjectsById: new Map([['eng', 'English']]),
  };
});
afterEach(cleanup);
const steps = async (which) => {
  state.graph.submissionStates = [{ worksheet_id: 'w1', ...SUBMISSIONS[which] }];
  state.graph.releasedScores = which === 'marked' ? [{ worksheet_id: 'w1', score: 1, total_points: 1 }] : [];
  render(<MemoryRouter><StudentTasksTab pdf /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Open Task one' }));
  const list = await screen.findByRole('list', { name: 'Progress' });
  return [...list.children].map(li => ({
    look: li.className,
    icon: li.querySelector('.x-std-dot svg')?.getAttribute('class').match(/lucide-(check|clock)\b/)?.[1] ?? null,
    hidden: li.querySelector('.x-std-dot').getAttribute('aria-hidden'),
    sr: li.querySelector('.sr-only').textContent,
    current: li.getAttribute('aria-current'),
    wait: li.querySelector('.x-std-wait')?.textContent ?? null,
  }));
};

describe('U-PDF-S3 progress steps', () => {
  it('not turned in: Assigned in progress (clock, bold), the other two upcoming', async () => {
    expect(await steps('assigned')).toEqual([
      { look: 'now x-std-strong', icon: 'clock', hidden: 'true', sr: ', in progress', current: 'step', wait: null },
      { look: 'next', icon: null, hidden: 'true', sr: ', not yet', current: null, wait: null },
      { look: 'next', icon: null, hidden: 'true', sr: ', not yet', current: null, wait: null },
    ]);
  });

  it('turned in, not marked: two done (checks), Marked in progress with "Waiting for your teacher"', async () => {
    expect(await steps('waiting')).toEqual([
      { look: 'done', icon: 'check', hidden: 'true', sr: ', done', current: null, wait: null },
      { look: 'done', icon: 'check', hidden: 'true', sr: ', done', current: 'step', wait: null },
      { look: 'now x-std-strong', icon: 'clock', hidden: 'true', sr: ', in progress', current: null, wait: 'Waiting for your teacher' },
    ]);
  });

  it('marked: all three done, Marked bold, no waiting line', async () => {
    expect(await steps('marked')).toEqual([
      { look: 'done', icon: 'check', hidden: 'true', sr: ', done', current: null, wait: null },
      { look: 'done', icon: 'check', hidden: 'true', sr: ', done', current: null, wait: null },
      { look: 'done x-std-strong', icon: 'check', hidden: 'true', sr: ', done', current: 'step', wait: null },
    ]);
    expect(screen.queryByText('Waiting for your teacher')).toBeNull();
  });

  it('accessible names carry the state as text', async () => {
    await steps('waiting');
    expect([...screen.getByRole('list', { name: 'Progress' }).children].map(li => li.textContent))
      .toEqual(['Assigned, done', 'Turned in, done', 'Marked, in progressWaiting for your teacher']);
  });
});

describe('U-PDF-S3 one colour, fixed size, contrast', () => {
  const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
  const read = rel => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
  const css = read('styles/clarity-components.css');
  const stepRules = css.split('\n').filter(line => /\.x-std-(steps|dot|wait)\b/.test(line) && !line.trim().startsWith('@'));

  it('the step rules use only tokens, the primary one for state, never the green (ok) one or a literal colour', () => {
    expect(stepRules.length).toBeGreaterThanOrEqual(5);
    const text = stepRules.join('\n');
    expect(text).not.toMatch(/#[0-9a-f]{3,8}\b|rgb|hsl|--cl-ok|--cl-in\b|indigo|green/i);
    expect(text).toMatch(/li\.done \.x-std-dot \{[^}]*background: var\(--cl-ac\); color: var\(--cl-ac-t\)/);
    expect(text).toMatch(/li\.now \.x-std-dot \{[^}]*border-color: var\(--cl-ac\); color: var\(--cl-ac\)/);
    expect(text).toMatch(/\.x-std-dot \{[^}]*border: 2px solid var\(--cl-bd2\)/);
  });

  it('the circle is 36 px in every state; only the wide compact bar makes it 28 px (also for every state)', () => {
    const sized = stepRules.filter(line => /[\s;{](width|height):/.test(line));
    expect(sized).toHaveLength(3);
    expect(sized[0]).toMatch(/box-sizing: border-box; width: 36px; height: 36px;/);
    expect(sized.slice(1).map(line => line.trim().replace(/^html\.\S+ \.x-stk /, ''))).toEqual([
      '.x-std-steps .x-std-dot { grid-row: 1 / span 2; width: 28px; height: 28px; }',
      '.x-std-steps .x-std-dot svg { width: 16px; height: 16px; }',
    ]);
    expect(sized.some(line => /li\.(done|now|next)/.test(line))).toBe(false);
  });

  it('the step markup carries no colour class', () => {
    const jsx = read('pages/dashboards/student/tabs/TasksTab.jsx');
    const block = jsx.slice(jsx.indexOf('aria-label="Progress"'), jsx.indexOf('</ol>', jsx.indexOf('aria-label="Progress"')));
    expect(block).toContain('<Check ');
    expect(block).not.toMatch(/green|indigo|emerald|violet|#[0-9a-f]{3,8}\b/i);
  });

  it('check on blue and blue on the card are at least 3:1 in light and dark', () => {
    const tokens = read('styles/clarity.css');
    const blocks = tokens.split(/\n\}/).filter(b => b.includes('--cl-ac:'));
    expect(blocks).toHaveLength(2);
    const lum = hex => {
      const full = hex.length === 4 ? `#${[...hex.slice(1)].map(c => c + c).join('')}` : hex;
      const [r, g, b] = [1, 3, 5].map(i => parseInt(full.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    for (const block of blocks) {
      const v = name => block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,6})\\b`))[1];
      expect(ratio(v('--cl-ac-t'), v('--cl-ac'))).toBeGreaterThanOrEqual(3);
      expect(ratio(v('--cl-ac'), v('--cl-card'))).toBeGreaterThanOrEqual(3);
    }
  });
});
