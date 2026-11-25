// @vitest-environment jsdom
// U-PDF-T-FIX-A (design p16): the cards beside the lesson plan document show real data only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import PlanViewAside from './PlanViewAside';

afterEach(cleanup);
const plan = { id: 'p1', title: 'Linear Equations', created_at: '2026-11-18T06:14:00Z', updated_at: '2026-11-20T02:05:00Z' };
const sheet = { id: 'w1', title: 'Linear Equations Worksheet', items: 10, task_type: 'quiz', created_at: '2026-11-19T01:00:00Z' };
const card = name => screen.queryByRole('region', { name });

describe('PlanViewAside', () => {
  it('no linked worksheet: no Linked worksheet card; Details and History still show', () => {
    render(<PlanViewAside plan={plan} worksheets={[]} details={<p>fields</p>} />);
    expect(card('Linked worksheet')).toBeNull();
    expect(within(card('Details')).getByText('fields')).toBeTruthy();
    expect(within(card('History')).getAllByRole('listitem').map(li => li.firstChild.textContent)).toEqual(['Edited', 'Created']);
  });

  it('linked and out of sync: title, items and type, both pills, and Sync calls the handler', () => {
    const onSync = vi.fn();
    render(<PlanViewAside plan={plan} worksheets={[sheet]} canSync onSync={onSync} />);
    const linked = card('Linked worksheet');
    expect(linked.textContent).toContain('Linear Equations Worksheet');
    expect(linked.textContent).toContain('10 items · Quiz');
    expect(within(linked).getByText('Out of sync')).toBeTruthy();
    expect(within(linked).getByText('Saved')).toBeTruthy();
    fireEvent.click(within(linked).getByRole('button', { name: /^Sync with updated plan/ }));
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it('in sync: no Out of sync pill and no Sync button', () => {
    render(<PlanViewAside plan={{ ...plan, updated_at: '2026-11-18T06:14:00Z' }} worksheets={[{ ...sheet, created_at: '2026-11-19T01:00:00Z' }]} canSync onSync={vi.fn()} />);
    expect(within(card('Linked worksheet')).queryByText('Out of sync')).toBeNull();
    expect(screen.queryByRole('button', { name: /Sync with updated plan/ })).toBeNull();
  });

  it('Sync is not offered when the plan cannot generate, and is disabled while busy', () => {
    render(<PlanViewAside plan={plan} worksheets={[sheet]} canSync={false} onSync={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Sync with updated plan/ })).toBeNull();
    cleanup();
    render(<PlanViewAside plan={plan} worksheets={[sheet]} canSync syncDisabled onSync={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Sync with updated plan/ }).disabled).toBe(true);
  });

  it('an Activity (stored as worksheet) with no items reads "Activity"; more than one worksheet says so', () => {
    render(<PlanViewAside plan={plan} worksheets={[{ ...sheet, items: 0, task_type: 'worksheet' }, { ...sheet, id: 'w0' }]} />);
    const linked = card('Linked worksheet');
    expect(linked.textContent).toContain('Activity');
    expect(linked.textContent).not.toContain('0 items');
    expect(linked.textContent).toContain('2 worksheets were made from this plan. This is the newest.');
  });

  it('no plan dates and no worksheets: no History card', () => {
    render(<PlanViewAside plan={{ id: 'p1' }} worksheets={[]} />);
    expect(card('History')).toBeNull();
    expect(card('Details')).toBeNull();
  });
});
