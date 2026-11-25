// @vitest-environment jsdom
// U-T1: the teacher Overview has no "Create lesson plan" header button (it
// overrides design p1); Quick actions still opens Lesson Plans.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../../../config/supabase', () => {
  const q = new Proxy({}, { get: (_, prop) => (prop === 'then'
    ? (ok, bad) => Promise.resolve({ data: [], count: 0, error: null }).then(ok, bad)
    : (prop === 'single' || prop === 'maybeSingle') ? async () => ({ data: { school_year: '2026-2027' }, error: null }) : () => q) });
  return { supabase: { from: () => q } };
});
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'teacher-1', name: 'Sample Teacher' } }) }));

import ClarityTeacherOverviewTab from './ClarityTeacherOverviewTab';

const Where = () => <output data-testid="where">{useLocation().pathname}</output>;
afterEach(cleanup);

describe('U-T1 teacher Overview header', () => {
  it('the header holds only the title and subtitle; Quick actions keeps Create lesson plan', async () => {
    const { container } = render(<MemoryRouter initialEntries={['/teacher-dashboard']}><Routes><Route path="*" element={<><ClarityTeacherOverviewTab /><Where /></>} /></Routes></MemoryRouter>);
    await screen.findByRole('heading', { level: 1, name: 'Dashboard Overview' });
    const head = container.querySelector('.x-head');
    expect(within(head).queryAllByRole('button')).toHaveLength(0);
    expect(head.querySelector('.x-act')).toBeNull();
    const create = await screen.findByRole('button', { name: /^Create lesson plan$/ });
    expect(head.contains(create)).toBe(false);
    fireEvent.click(create);
    expect(screen.getByTestId('where').textContent).toBe('/teacher-dashboard/lesson-plans');
  });
});
