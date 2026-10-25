import { backendRequest } from '../../../../lib/backendApi';

// Server and worker gates stay disabled until isolated PostgreSQL tests pass.
export const WEEKLY_JOBS_ENABLED = false;
const unavailable = () => Promise.reject(new Error('Durable Worksheet generation is unavailable. Nothing was saved.'));

export function createWeeklyJobClient({ enabled = false, request = backendRequest } = {}) {
  const call = (path, options) => enabled ? request(`/api/ai/weekly-jobs${path}`, options) : unavailable();
  const json = (method, body) => ({ method, body: JSON.stringify(body) });
  return Object.freeze({ enabled,
    submit: body => call('/', json('POST', body)),
    listJobs: () => call('/'),
    status: id => call(`/${encodeURIComponent(id)}`),
    cancel: id => call(`/${encodeURIComponent(id)}/cancel`, json('POST', {})),
    resume: id => call(`/${encodeURIComponent(id)}/resume`, json('POST', {})),
    listCollections: () => call('/collections'),
    openCollection: id => call(`/collections/${encodeURIComponent(id)}`),
    readDaily: (id, dayId) => call(`/collections/${encodeURIComponent(id)}/days/${encodeURIComponent(dayId)}`),
    updateDaily: (id, dayId, worksheet, expectedRevision) => call(
      `/collections/${encodeURIComponent(id)}/days/${encodeURIComponent(dayId)}`,
      json('PATCH', { worksheet, expectedRevision })),
    changeArchive: (id, body) => call(`/collections/${encodeURIComponent(id)}/archive`, json('POST', body)),
    deleteEligibleDraft: (id, expectedRevision) => call(`/collections/${encodeURIComponent(id)}`,
      json('DELETE', { expectedRevision })),
  });
}

export const weeklyJobClient = createWeeklyJobClient({ enabled: WEEKLY_JOBS_ENABLED });
