// @vitest-environment jsdom
// U-S4: status labels never break inside a word. Calendar pills carry a
// one-letter code (shown on phones by CSS) while the word stays in the text
// for screen readers; on phones the records table becomes a list (design p11).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({ tables: {} }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'stu-1' } }) }));
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: q => q() }));
vi.mock('../../../pages/dashboards/student/hooks', async (orig) => ({ ...(await orig()), useToast: () => ({ showToast: () => {}, Toast: () => null }) }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', async () => {
  const { createContext: make } = await import('react');
  return { default: make({ graph: { enrolments: [{ section_id: 'sec-1', sections: { name: 'Rizal' } }] } }) };
});
vi.mock('../../../config/supabase', () => ({ supabase: { from(table) {
  const q = new Proxy({}, { get: (_, prop) => (prop === 'then'
    ? (ok, bad) => Promise.resolve({ data: h.tables[table] || [], error: null }).then(ok, bad)
    : () => q) });
  return q;
} } }));

import ClarityStudentAttendanceTab from './ClarityStudentAttendanceTab';

const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
// The theme class is built, never written out (only the theme files may contain it).
const P = `html.${['theme', 'clarity'].join('-')} `;
const css = readFileSync(join(SRC, 'styles', 'clarity-components.css'), 'utf8').replace(/\r\n/g, '\n');
const row = (id, date, status) => ({ id, student_id: 'stu-1', section_id: 'sec-1', date, status, subject: null, remarks: null });
const settle = async () => { await vi.waitFor(() => expect(screen.queryByText(/Loading/)).toBeNull()); };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-25T02:00:00Z'));
  h.tables = { attendance: [row('a1', '2026-11-16', 'Present'), row('a2', '2026-11-17', 'Late'), row('a3', '2026-11-18', 'Absent'),
    row('a4', '2026-11-19', 'Excused'), row('a5', '2026-11-20', 'Holiday')] };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('U-S4 calendar pills', () => {
  it('each pill keeps the full word and carries its letter code and tooltip', async () => {
    render(<ClarityStudentAttendanceTab />); await settle();
    const grid = screen.getByRole('table', { name: 'Attendance in November 2026' });
    const pills = [...grid.querySelectorAll('.x-badge')].map(b => [b.textContent, b.getAttribute('data-code'), b.getAttribute('title')]);
    expect(pills).toEqual([['Present', 'P', 'Present'], ['Late', 'L', 'Late'], ['Absent', 'A', 'Absent'], ['Excused', 'E', 'Excused'],
      ['Other (Holiday)', '?', 'Other (Holiday)']]);
  });
  it('records-table pills carry no code (the list shows the whole word)', async () => {
    render(<ClarityStudentAttendanceTab />); await settle();
    const records = screen.getByRole('region', { name: 'Attendance records' });
    expect(records.querySelectorAll('.x-badge[data-code]')).toHaveLength(0);
  });
});

describe('U-S4 CSS', () => {
  const phone = (() => {
    const at = css.indexOf('/* U-S4: a day cell shows the status letter');
    return css.slice(at, css.indexOf('\n}', at));
  })();
  it('no pill in the calendar or the records may break inside a word', () => {
    expect(css).toContain(P + '.x-sat-grid td .x-badge { display: flex; width: 100%; margin-top: 6px; border-radius: 6px; overflow-wrap: normal; }');
    expect(css).toContain(P + '.x-sat-records .x-badge { overflow-wrap: normal; }');
    expect(css).not.toMatch(/\.x-sat-grid td \.x-badge \{[^}]*overflow-wrap: anywhere/);
  });
  it('phones: the letter replaces the word visually; records become rows of date + status, details under them', () => {
    expect(phone).toContain(P + '.x-sat-grid td .x-badge[data-code]::before { content: attr(data-code);');
    expect(phone).toContain(P + '.x-sat-records .x-table tr { display: flex; flex-wrap: wrap;');
    expect(phone).toContain(P + '.x-sat-records .x-table td:nth-child(n+3):empty { display: none; }');
    expect(phone).not.toMatch(/nowrap|!important/);
    expect(css.lastIndexOf('@media (max-width: 767px) {', css.indexOf(phone))).toBeGreaterThan(-1);
  });
});
