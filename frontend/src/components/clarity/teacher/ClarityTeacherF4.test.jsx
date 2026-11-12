// @vitest-environment jsdom
// Clarity F4: presentation-only fidelity fixes in the Teacher Grading and
// Attendance tabs (final design pages 5-6). Every data source is mocked.
//   1. the Grading ring shows the real "score / total" in its centre
//   2. a Grading row shows "Submitted {Mon D}" from its real submitted_at
//   3. the Grading subtitle is the design's
//   4. the Attendance card title is "Today · Mon D" on today only
// Plus: ProgressRing without `center` renders exactly as before.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRouter } from 'react-router-dom';

// Stable functions: the tabs' effects depend on them, as in the T3 tests.
const fx = vi.hoisted(() => {
  const fx = { worksheets: [], submissions: [], attendance: [], toast: () => {} };
  fx.loadSubmissions = async () => fx.submissions;
  fx.loadAssigneeRoster = async () => [{ student_id: 'student-d', section_id: 'section-1', name: 'Learner D' }];
  fx.showToast = (...args) => fx.toast(...args);
  return fx;
});
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'teacher-1' } }) }));
vi.mock('../../../pages/dashboards/teacher/hooks', () => ({ useTheme: () => ({ dark: false }), useToast: () => ({ toast: null, showToast: fx.showToast }) }));
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../../../config/supabase', () => ({
  supabase: {
    rpc: async () => ({ data: null, error: null }),
    from: table => {
      const filters = {};
      const people = [['s1', 'Ana Cruz'], ['s2', 'Ben Reyes']];
      const rows = () => ({
        worksheets: fx.worksheets,
        sections: [{ id: 'sec-1', name: 'Rizal', grade_level: 'Grade 7', school_year: '2030-2031', adviser_id: 'teacher-1' }],
        section_students: people.map(([id]) => ({ student_id: id, section_id: 'sec-1', status: 'active' })),
        students: people.map(([id], i) => ({ id, lrn: `100${i}` })),
        profiles: people.map(([id, name]) => ({ id, name })),
        attendance: fx.attendance.filter(a => a.date === filters.date),
      }[table] || []);
      const query = {
        select: () => query, in: () => query, is: () => query, lte: () => query,
        eq: (column, value) => { filters[column] = value; return query; },
        order: () => Promise.resolve({ data: rows(), error: null }),
        single: () => Promise.resolve({ data: table === 'school_settings' ? { school_year: '2030-2031' } : null, error: null }),
        then: (resolve, reject) => Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
      };
      return query;
    },
  },
}));
vi.mock('../../../pages/dashboards/teacher/worksheets/useWorksheetAssessment', () => ({ useWorksheetAssessment: () => ({
  mySections: [{ id: 'section-1', name: 'A', grade_level: 'Grade 7' }], postings: [],
  loadSubmissions: fx.loadSubmissions, loadAssigneeRoster: fx.loadAssigneeRoster,
  loadItems: () => {}, loadAnswers: () => {}, saveMarks: () => {}, releaseScore: () => {}, encodeManualScore: () => {}, loadClassList: () => {},
  paperScoreEncodingAvailable: false,
}) }));
vi.mock('../../../pages/dashboards/teacher/worksheets/CheckSubmissionsModal', () => ({ default: () => null }));
vi.mock('../../../pages/dashboards/teacher/worksheets/EncodeScoresModal', () => ({ default: () => null }));

import ProgressRing from '../charts/ProgressRing';
import ClarityTeacherGradingTab from './ClarityTeacherGradingTab';
import ClarityTeacherAttendanceTab from './ClarityTeacherAttendanceTab';

// Local times, so the expected "Nov 10" holds in any test-runner time zone.
const NOV10 = new Date(2026, 10, 10, 9, 30).toISOString();
const NOV11 = new Date(2026, 10, 11, 8, 0).toISOString();
const sheet = { id: 'sheet-a', title: 'Photosynthesis', subject: 'Science', grade_level: 'Grade 7', teacher_id: 'teacher-1' };
const unscored = { id: 'sub-a', student_id: 'student-a', name: 'Learner A', section_id: 'section-1', source: 'online', status: 'submitted', released: false, score: null, total_points: null, submitted_at: NOV10 };
const released = { id: 'sub-b', student_id: 'student-b', name: 'Learner B', section_id: 'section-1', source: 'online', status: 'checked', released: true, score: 8, total_points: 15, submitted_at: NOV11 };
const late = { id: 'sub-c', student_id: 'student-c', name: 'Learner C', section_id: 'section-1', source: 'online', status: 'submitted', released: false, score: 4, total_points: 10, is_late: true, submitted_at: NOV10 };
const noDate = { id: 'sub-e', student_id: 'student-e', name: 'Learner E', section_id: 'section-1', source: 'manual', status: 'checked', released: false, score: null, total_points: null };

beforeEach(() => {
  fx.toast = vi.fn();
  Object.assign(fx, { worksheets: [sheet], submissions: [unscored, released, late, noDate], attendance: [] });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const showGrading = async () => {
  render(<MemoryRouter><ClarityTeacherGradingTab /></MemoryRouter>);
  return screen.findByRole('list', { name: 'Worksheet submissions' });
};
const rowLine = name => within(screen.getByRole('list', { name: 'Worksheet submissions' })).getByText(name)
  .closest('.x-tgr-who').querySelector('.x-cs').textContent;

describe('1. ProgressRing centre text', () => {
  it('without `center`, the markup is byte-identical to the T3 ring (captured from HEAD 668b43d)', () => {
    const html = renderToStaticMarkup(<ProgressRing value={53.3} label="Score" detail="8 / 15" unit="u" />);
    expect(html).toBe('<figure class="o-ring" style="margin:0;flex-direction:column;gap:6px"><svg class="x-svg" viewBox="0 0 42 42" role="img" aria-label="Score: 53 percent, 8 / 15" style="max-width:160px"><circle class="x-track" cx="21" cy="21" r="15.9155" aria-hidden="true"></circle><circle class="x-seg-ring c1" cx="21" cy="21" r="15.9155" stroke-dasharray="53.3 46.7" aria-hidden="true"></circle><text class="x-ringval" x="21" y="23.5" aria-hidden="true">53%</text><text class="x-ringlbl" x="21" y="28" aria-hidden="true">u</text></svg><figcaption style="text-align:center;overflow-wrap:anywhere;min-width:0" title="Score"><b style="display:block">Score</b><span class="x-cs">8 / 15</span></figcaption></figure>');
    expect(renderToStaticMarkup(<ProgressRing value={53.3} label="Score" detail="8 / 15" unit="u" center="" />)).toBe(html);
  });

  it('with `center`, only the centre text changes; the accessible name keeps the percentage', () => {
    const a = renderToStaticMarkup(<ProgressRing value={53.3} label="Score" detail="8 / 15" />);
    const b = renderToStaticMarkup(<ProgressRing value={53.3} label="Score" detail="8 / 15" center="8 / 15" />);
    expect(b).toBe(a.replace('aria-hidden="true">53%</text>', 'aria-hidden="true">8 / 15</text>'));
  });

  it('the Grading pane centres the real "score / total"; screen readers hear the score and percentage once', async () => {
    await showGrading();
    fireEvent.click(screen.getByRole('button', { name: /Learner B/ }));
    const pane = screen.getByRole('region', { name: 'Selected student' });
    const ring = within(pane).getByRole('img', { name: 'Score: 53 percent, 8 / 15' });
    expect(ring.querySelector('.x-ringval').textContent).toBe('8 / 15');
    expect(ring.querySelector('.x-ringval').getAttribute('aria-hidden')).toBe('true');
  });

  it('short centre text: no modifier; long (over 7 characters): the x-tgr-ring-long modifier', async () => {
    fx.submissions = [released, { ...released, id: 'sub-f', student_id: 'student-f', name: 'Learner F', score: 100, total_points: 100 }];
    await showGrading();
    const ringBox = name => { fireEvent.click(screen.getByRole('button', { name })); return screen.getByRole('region', { name: 'Selected student' }).querySelector('.x-tgr-ring'); };
    const short = ringBox(/Learner B/);
    expect(short.className).toBe('x-tgr-ring');
    expect(short.querySelector('.x-ringval').textContent).toBe('8 / 15');
    const long = ringBox(/Learner F/);
    expect(long.className).toBe('x-tgr-ring x-tgr-ring-long');
    expect(long.querySelector('.x-ringval').textContent).toBe('100 / 100');
  });

  it('the long modifier rule is scoped and only shrinks the centre text', () => {
    const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
    const css = readFileSync(join(SRC, 'styles/clarity-components.css'), 'utf8');
    expect(css).toContain(`${['html.theme', 'clarity'].join('-')} .x-tgr-ring-long .x-ringval { font-size: 5px; }`);
  });

  it('an unscored row still shows text, no ring', async () => {
    await showGrading();
    fireEvent.click(screen.getByRole('button', { name: /Learner A/ }));
    const pane = screen.getByRole('region', { name: 'Selected student' });
    expect(within(pane).queryByRole('img')).toBeNull();
    expect(pane.querySelector('.x-tgr-score').textContent).toBe('Not scored');
  });
});

describe('2. Grading row line', () => {
  it('"Submitted {Mon D}" only for an unscored row with a real submitted_at; scored rows show only the score; no date invented', async () => {
    await showGrading();
    expect(rowLine('Learner A')).toBe('Submitted Nov 10');
    expect(rowLine('Learner B')).toBe('8 / 15');
    expect(rowLine('Learner E')).toBe('Not scored');
    expect(rowLine('Learner D')).toBe('No submission yet');
  });

  it('a late scored row shows only its score and keeps its Late pill; the pane still lists its Submitted fact', async () => {
    await showGrading();
    expect(rowLine('Learner C')).toBe('4 / 10');
    const li = within(screen.getByRole('list', { name: 'Worksheet submissions' })).getByText('Learner C').closest('li');
    expect(within(li).getByText('Late')).toBeTruthy();
    expect(within(li).getByText('Needs checking')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Learner C/ }));
    const facts = screen.getByRole('region', { name: 'Selected student' }).querySelector('.x-tgr-facts');
    expect(within(facts).getByText('Submitted').nextElementSibling.textContent).toMatch(/Nov 10, 2026/);
  });

  it('the pane keeps the Submitted fact only where it was before (late rows)', async () => {
    await showGrading();
    fireEvent.click(screen.getByRole('button', { name: /Learner A/ }));
    const facts = screen.getByRole('region', { name: 'Selected student' }).querySelector('.x-tgr-facts');
    expect(within(facts).queryByText('Submitted')).toBeNull();
  });
});

describe('3. Grading subtitle', () => {
  it('is the design text', async () => {
    await showGrading();
    expect(screen.getByText('Review one submission at a time.')).toBeTruthy();
    expect(screen.queryByText('Check, release and review worksheet results.')).toBeNull();
  });
});

describe('4. Attendance card title', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-03-13T02:00:00Z')); // Wed Mar 13 in Manila
  });
  const title = () => within(screen.getByLabelText('Attendance totals')).getByRole('heading', { level: 2 }).textContent;

  it('today: "Today · Mar 13"; another date keeps the full label', async () => {
    render(<MemoryRouter><ClarityTeacherAttendanceTab /></MemoryRouter>);
    await screen.findByRole('table');
    expect(title()).toBe('Today · Mar 13');
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await screen.findByText(/· 2030-03-12/);
    expect(title()).toBe('Tuesday · Tue, Mar 12, 2030');
  });
});

describe('copy and CSS', () => {
  it('"preview" appears nowhere in the rendered tabs', async () => {
    await showGrading();
    expect(document.body.textContent).not.toMatch(/preview/i);
  });

  it('every x-tgr / x-tat selector is scoped under the theme class', () => {
    const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
    const css = readFileSync(join(SRC, 'styles/clarity-components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const scope = ['html.theme', 'clarity'].join('-');
    const sels = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap(m => m[1].split(',')).filter(s => /\.x-(tgr|tat)/.test(s));
    expect(sels.length).toBeGreaterThan(0);
    for (const s of sels) expect(s.trim().startsWith(scope), s).toBe(true);
  });
});
