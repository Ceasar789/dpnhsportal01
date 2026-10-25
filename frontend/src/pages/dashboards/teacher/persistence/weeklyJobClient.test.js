// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createWeeklyJobClient, WEEKLY_JOBS_ENABLED } from './weeklyJobClient';

describe('weekly job API gate', () => {
  it('keeps production wiring disabled and makes no request', async () => {
    const request = vi.fn();
    const client = createWeeklyJobClient({ request });
    expect(WEEKLY_JOBS_ENABLED).toBe(false);
    await expect(client.submit({})).rejects.toThrow(/unavailable/);
    expect(request).not.toHaveBeenCalled();
  });

  it('maps status, private daily read and revision edit to the trusted API', async () => {
    const request = vi.fn(async () => ({ ok: true }));
    const client = createWeeklyJobClient({ enabled: true, request });
    await client.status('job-1');
    await client.readDaily('collection-1', 'monday-1');
    await client.updateDaily('collection-1', 'monday-1', { id: 'monday-1' }, 2);
    expect(request.mock.calls[0][0]).toBe('/api/ai/weekly-jobs/job-1');
    expect(request.mock.calls[1][0]).toBe('/api/ai/weekly-jobs/collections/collection-1/days/monday-1');
    expect(JSON.parse(request.mock.calls[2][1].body)).toEqual({ worksheet: { id: 'monday-1' }, expectedRevision: 2 });
  });
});
