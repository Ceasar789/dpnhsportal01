// @vitest-environment jsdom
// The Important badge follows the stored priority whatever its case: the
// database stores 'High', which the badge used to miss ('high' only).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

const state = vi.hoisted(() => ({ result: null }));

vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1' } }) }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../../config/supabase', () => ({
  supabase: { from() {
    const query = {
      select() { return query; }, eq() { return query; }, or() { return query; }, order() { return query; },
      then(resolve, reject) { return Promise.resolve(state.result).then(resolve, reject); },
    };
    return query;
  } },
}));

import AnnouncementsTab from './AnnouncementsTab';

afterEach(cleanup);

const CASES = [
  ['High', 'p-high-upper', true],
  ['high', 'p-high-lower', true],
  [' HIGH ', 'p-high-spaced', true],
  ['Normal', 'p-normal', false],
  ['', 'p-empty', false],
  [null, 'p-null', false],
];

describe('student announcements Important badge', () => {
  it('marks High in any case as Important, and nothing else; the order stays as loaded', async () => {
    state.result = {
      data: CASES.map(([priority, title], i) => ({
        id: title, title, content: 'Body', priority,
        created_at: `2030-03-0${8 - i}T02:00:00`,
      })),
      error: null,
    };
    render(<AnnouncementsTab />);
    await screen.findByText('p-high-upper');

    for (const [priority, title, important] of CASES) {
      const card = screen.getByText(title).parentElement;
      expect(within(card).queryByText('Important') !== null, `priority ${JSON.stringify(priority)}`).toBe(important);
    }
    // Order is the query's (newest first), unchanged by priority.
    const titles = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent);
    expect(titles).toEqual(CASES.map(([, title]) => title));
  });

  it('a missing priority field does not crash and shows no badge', async () => {
    state.result = { data: [{ id: 'x', title: 'No field', content: 'Body', created_at: '2030-03-01T02:00:00' }], error: null };
    render(<AnnouncementsTab />);
    const card = (await screen.findByText('No field')).parentElement;
    expect(within(card).queryByText('Important')).toBeNull();
  });
});
