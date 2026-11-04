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
// Each claimed batch selects one chain entry; no batch failover occurs.
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
  let providerNameForBatch;
  if (useGemini) {
    if (!configured(env.GEMINI_API_KEY)) invalid();
    providerNameForBatch = () => 'gemini';
    providerBatch = (prompt, { signal, responseSchema, maxOutputTokens }) =>
      geminiRequest(prompt, { apiKey: env.GEMINI_API_KEY.trim(), signal, responseSchema, maxOutputTokens });
  } else {
    let entries;
    try { entries = parseWeeklyWorksheetProviders(env.WEEKLY_WORKSHEET_PROVIDERS); }
    catch { invalid(); }
    const configuredEntries = entries.map(entry => {
      const keyName = weeklyProviderKeyEnv(entry.name);
      const accountName = weeklyProviderAccountIdEnv(entry.name);
      const apiKey = keyName && env[keyName];
      const accountId = accountName && env[accountName];
      if (!configured(apiKey) || (accountName && !/^[0-9a-f]{32}$/i.test(accountId || '')))
        invalid();
      return { provider: entry.name, model: entry.model, apiKey: apiKey.trim(),
        ...(accountName ? { accountId } : {}) };
    });
    const selectedProvider = batchIndex => {
      if (!Number.isSafeInteger(batchIndex) || batchIndex < 0 || batchIndex >= 20) invalid();
      return configuredEntries[batchIndex % configuredEntries.length];
    };
    providerNameForBatch = batchIndex => selectedProvider(batchIndex).provider;
    providerBatch = (prompt, { batchIndex, ...options }) =>
      providerRequest(prompt, { ...options, ...selectedProvider(batchIndex) });
  }

  const serviceRoleClient = getServiceRoleClient();
  if (typeof serviceRoleClient?.rpc !== 'function') invalid();
  const jobAdapter = createJobAdapter({ serviceRoleClient,
    teacherClientForJwt: () => { throw new TypeError('Worker has no teacher session.'); } });
  const batchService = createBatchService({ jobAdapter, providerBatch, providerNameForBatch });
  const assemblyService = createAssemblyService({ jobAdapter });
  const coordinator = createCoordinator({ jobAdapter, batchService, assemblyService });
  return createRouter({ coordinator, workerSecret: env.WEEKLY_DRAFT_WORKER_SECRET });
}
