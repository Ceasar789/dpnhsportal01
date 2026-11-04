import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveWeeklyJobCollection, weeklyProductionSaveFlagEnabled } from './weeklyWorksheetProductionSaveClient';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('../../../../config/supabase', () => ({ supabase: { auth: { getSession } } }));
const jobId = '22345678-1234-4234-8234-123456789abc';
const requestId = '32345678-1234-4234-8234-123456789abc';
const collection = { collectionId: jobId,
  worksheets: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day =>
    ({ day, questions: [{}] })) };
const command = { jobId, requestId, collection };
const receipt = { ok: true, durable: true, collectionId: '12345678-1234-4234-8234-123456789abc',
  worksheets: [1, 2, 3, 4, 5].map((day, index) => ({ day,
    id: `42345678-1234-4234-8234-123456789ab${index}`, items: 1 })) };

beforeEach(() => {
  vi.stubEnv('PROD', true);
  vi.stubEnv('VITE_WEEKLY_WORKSHEET_PRODUCTION_SAVE_ENABLED', 'true');
  getSession.mockResolvedValue({ data: { session: { access_token: 'synthetic-token' } } });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); getSession.mockReset(); });

describe('explicit production weekly Save client', () => {
  it('is off unless the production flag is exact true', () => {
    for (const value of [undefined, '', 'false', '1', 'TRUE']) {
      vi.stubEnv('VITE_WEEKLY_WORKSHEET_PRODUCTION_SAVE_ENABLED', value);
      expect(weeklyProductionSaveFlagEnabled()).toBe(false);
    }
    vi.stubEnv('VITE_WEEKLY_WORKSHEET_PRODUCTION_SAVE_ENABLED', 'true');
    expect(weeklyProductionSaveFlagEnabled()).toBe(true);
    vi.stubEnv('PROD', false);
    expect(weeklyProductionSaveFlagEnabled()).toBe(false);
  });

  it('sends one explicit authenticated request and validates all five receipt days', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => receipt });
    vi.stubGlobal('fetch', fetchMock);
    const result = await saveWeeklyJobCollection('https://example.test', command);
    expect(result.status).toBe('saved');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/api/weekly-worksheets/production-save');
    expect(options.headers.Authorization).toBe('Bearer synthetic-token');
    expect(JSON.parse(options.body)).toEqual(command);
  });

  it('keeps definite validation/auth refusals distinct from ambiguous transport or receipts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false,
      json: async () => ({ ok: false, durable: false, code: 'invalid_document' }) })
      .mockResolvedValueOnce({ ok: false,
        json: async () => ({ ok: false, durable: false, code: 'not_authenticated' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockRejectedValueOnce(new Error('uncertain transport')));
    expect((await saveWeeklyJobCollection('', command)).code).toBe('invalid_document');
    expect((await saveWeeklyJobCollection('', command)).code).toBe('not_authenticated');
    expect((await saveWeeklyJobCollection('', command)).status).toBe('unknown');
    expect((await saveWeeklyJobCollection('', command)).status).toBe('unknown');
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
