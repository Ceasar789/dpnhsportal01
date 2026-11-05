const DISPATCH_URL = 'https://api.github.com/repos/Ceasar789/dpnhsportal01/actions/workflows/weekly-draft-worker.yml/dispatches';
const PRODUCTION_URL = 'eduscribe-dnhs-portal.vercel.app';
const SUPABASE_URL = 'https://jllstakxiamxiycnwrbd.supabase.co';
const TIMEOUT_MS = 5000;

const configuredToken = value => typeof value === 'string' && !!value
  && !/\s/.test(value) && Buffer.byteLength(value, 'utf8') <= 1024;

export const weeklyDraftWorkflowWakeEnabled = (env = process.env) =>
  env?.NODE_ENV === 'production' && env.VERCEL === '1'
  && env.VERCEL_ENV === 'production' && env.WEEKLY_DRAFT_GENERATION_ENABLED === 'true'
  && env.WEEKLY_DRAFT_WORKFLOW_DISPATCH_ENABLED === 'true'
  && env.VERCEL_PROJECT_PRODUCTION_URL === PRODUCTION_URL
  && /^prj_[A-Za-z0-9]+$/.test(env.WEEKLY_DRAFT_VERCEL_PROJECT_ID || '')
  && env.VERCEL_PROJECT_ID === env.WEEKLY_DRAFT_VERCEL_PROJECT_ID
  && env.SUPABASE_URL === SUPABASE_URL
  && configuredToken(env.WEEKLY_DRAFT_GITHUB_TOKEN);

// A workflow dispatch only wakes the existing DB-backed worker. It creates no job.
export function createWeeklyDraftWorkflowWake({ env = process.env,
  fetchImpl = (...args) => fetch(...args), clock = { setTimeout, clearTimeout } } = {}) {
  return async () => {
    if (!weeklyDraftWorkflowWakeEnabled(env)) return 'unavailable';
    const controller = new AbortController();
    let timer;
    try {
      const response = await Promise.race([
        fetchImpl(DISPATCH_URL, {
          method: 'POST', redirect: 'manual', signal: controller.signal,
          headers: { Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${env.WEEKLY_DRAFT_GITHUB_TOKEN}`,
            'X-GitHub-Api-Version': '2026-03-10',
            'Content-Type': 'application/json' },
          body: '{"ref":"master"}',
        }),
        new Promise(resolve => { timer = clock.setTimeout(() => {
          controller.abort();
          resolve(null);
        }, TIMEOUT_MS); }),
      ]);
      if (response?.status === 204 && response.redirected === false) return 'accepted';
      // Do not consume, return, or log GitHub's response body.
      void response?.body?.cancel?.().catch?.(() => {});
      return 'unconfirmed';
    } catch {
      return 'unconfirmed';
    } finally {
      clock.clearTimeout(timer);
    }
  };
}
