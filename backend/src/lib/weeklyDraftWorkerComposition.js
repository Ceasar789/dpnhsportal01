import { adminClient } from '../middleware/requireAuth.js';
import { createWeeklyDraftJobRpcAdapter } from '../persistence/weeklyDraftJobRpcAdapter.js';
import { createWeeklyDraftWorkerRouter } from '../routes/weeklyDraftWorker.js';
import { createWeeklyDraftAssemblyService } from './weeklyDraftAssemblyService.js';
import { createWeeklyDraftBatchService } from './weeklyDraftBatchService.js';
import { createWeeklyDraftWorkerCoordinator } from './weeklyDraftWorkerCoordinator.js';
import { requestWorksheetJsonFromGemini } from './worksheetGenerator.js';
import { parseWeeklyWorksheetProviders, requestOpenAICompatibleWorksheetJson,
  weeklyProviderAccountIdEnv, weeklyProviderKeyEnv } from './weeklyWorksheetProvider.js';

const configured = value => typeof value === 'string' && !!value.trim();
const invalid = () => { throw new TypeError('Weekly draft worker configuration is unavailable.'); };

// Construction only: no job read, RPC, provider request, or scheduler is started.
// The first configured provider is fixed for this worker; no batch failover occurs.
export function createWeeklyDraftWorkerComposition({ env = process.env,
  getServiceRoleClient = adminClient,
  providerRequest = requestOpenAICompatibleWorksheetJson,
  geminiRequest = requestWorksheetJsonFromGemini,
  createJobAdapter = createWeeklyDraftJobRpcAdapter,
  createBatchService = createWeeklyDraftBatchService,
  createAssemblyService = createWeeklyDraftAssemblyService,
  createCoordinator = createWeeklyDraftWorkerCoordinator,
  createRouter = createWeeklyDraftWorkerRouter } = {}) {
  const useGemini = env?.WEEKLY_DRAFT_PROVIDER === 'gemini';
  if (!env || (env.WEEKLY_DRAFT_PROVIDER !== undefined && !useGemini)
    || !configured(env.SUPABASE_URL)
    || !configured(env.SUPABASE_SERVICE_ROLE_KEY)
    || !configured(env.WEEKLY_DRAFT_WORKER_SECRET)
    || /\s/.test(env.WEEKLY_DRAFT_WORKER_SECRET)
    || Buffer.byteLength(env.WEEKLY_DRAFT_WORKER_SECRET, 'utf8') > 1024
    || typeof getServiceRoleClient !== 'function'
    || typeof (useGemini ? geminiRequest : providerRequest) !== 'function'
    || (env !== process.env && (getServiceRoleClient === adminClient
      || (!useGemini && providerRequest === requestOpenAICompatibleWorksheetJson)))
    || [createJobAdapter, createBatchService, createAssemblyService,
      createCoordinator, createRouter].some(factory => typeof factory !== 'function')) invalid();

  let providerBatch;
  if (useGemini) {
    if (!configured(env.GEMINI_API_KEY)) invalid();
    providerBatch = (prompt, { signal, responseSchema, maxOutputTokens }) =>
      geminiRequest(prompt, { apiKey: env.GEMINI_API_KEY.trim(), signal, responseSchema, maxOutputTokens });
  } else {
    let entries;
    try { entries = parseWeeklyWorksheetProviders(env.WEEKLY_WORKSHEET_PROVIDERS); }
    catch { invalid(); }
    const selected = entries[0];
    const keyName = weeklyProviderKeyEnv(selected?.name);
    const accountName = weeklyProviderAccountIdEnv(selected?.name);
    const apiKey = keyName && env[keyName];
    if (!configured(apiKey) || (accountName && !/^[0-9a-f]{32}$/i.test(env[accountName] || '')))
      invalid();
    providerBatch = (prompt, options) => providerRequest(prompt, { ...options,
      provider: selected.name, model: selected.model, apiKey: apiKey.trim() });
  }

  const serviceRoleClient = getServiceRoleClient();
  if (typeof serviceRoleClient?.rpc !== 'function') invalid();
  const jobAdapter = createJobAdapter({ serviceRoleClient,
    teacherClientForJwt: () => { throw new TypeError('Worker has no teacher session.'); } });
  const batchService = createBatchService({ jobAdapter, providerBatch });
  const assemblyService = createAssemblyService({ jobAdapter });
  const coordinator = createCoordinator({ jobAdapter, batchService, assemblyService });
  return createRouter({ coordinator, workerSecret: env.WEEKLY_DRAFT_WORKER_SECRET });
}
