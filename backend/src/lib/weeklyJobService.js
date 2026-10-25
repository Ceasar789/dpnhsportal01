import { createHash, randomUUID } from 'node:crypto';
import { buildWeeklyWorksheetPrompt, generateWeeklyWorksheetDrafts, parseDailyBatch,
  validateWeeklySources, WEEKLY_QUESTION_COUNTS, RESPONSE_SCHEMA } from './weeklyWorksheetGenerator.js';
import { requestWeeklyWorksheetJson } from './weeklyWorksheetProvider.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const BATCH_SIZE = 10;
const JOB_VERSION = 1;
const LEASE_MS = 110_000;
const SAFE_FAILURES = new Set(['PROVIDER_RATE_LIMIT', 'PROVIDER_DAILY_QUOTA', 'PROVIDER_OVERLOADED',
  'PROVIDER_INTERRUPTED', 'PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE', 'PROVIDER_REJECTED',
  'PROVIDER_AUTH_FAILED', 'PROVIDER_ACCESS_DENIED',
  'PROVIDER_TRUNCATED', 'PROVIDER_INVALID_RESPONSE', 'PROVIDER_NOT_CONFIGURED',
  'syntax', 'missing_required', 'invalid_field', 'invalid_answer_key', 'invalid_essay',
  'duplicate_question', 'question_count', 'content_coverage', 'type_distribution', 'source_changed']);
const fail = code => Object.assign(new Error(code), { code });
const hash = value => createHash('sha256').update(value).digest('hex');
const publicJob = job => ({ id: job.id, version: job.version, sourceLessonPlanId: job.sourceLessonPlanId,
  questionCount: job.questionCount, createdAt: job.createdAt, status: job.status,
  plannedProviderCalls: job.plannedProviderCalls, attemptedProviderCalls: job.attemptedProviderCalls,
  completedValidatedBatches: job.checkpoints.length, retryAfter: job.retryAfter || null,
  failureCategory: job.failureCategory || null, collectionId: job.status === 'COMPLETED' ? job.collectionId : null });

// The repository must make every transaction atomic and serialize claims and receipts.
// No route or production dispatcher is mounted for this service.
export function createWeeklyJobService({ repository, resolveIdentity, resolveSource,
  generateText = requestWeeklyWorksheetJson, now = () => Date.now(), newId = randomUUID } = {}) {
  if (!repository?.atomic || typeof resolveIdentity !== 'function' || typeof resolveSource !== 'function')
    throw fail('integration_blocked');
  const owned = async (tx, id, teacherId) => {
    const job = await tx.getJob(id);
    if (!job || job.teacherId !== teacherId) throw fail('not_found');
    return job;
  };
  const teacher = async credential => {
    const user = await resolveIdentity(credential);
    if (!user?.id || user.role !== 'teacher' || user.status !== 'active') throw fail('not_authenticated');
    return user.id;
  };
  const trustedSource = async (teacherId, sourceLessonPlanId) => {
    const source = await resolveSource({ teacherId, sourceLessonPlanId });
    const plan = source?.plan;
    if (!plan || plan.id !== sourceLessonPlanId || plan.teacher_id !== teacherId
      || plan.ai_generated !== true || !plan.title?.trim() || typeof plan.objectives !== 'string')
      throw fail('source_denied');
    return { plan, sources: validateWeeklySources(source.days), sourceHash: hash(plan.objectives),
      sourceVersion: String(plan.authoring_revision || hash(plan.objectives)) };
  };
  const service = Object.freeze({
    async submit(credential, { requestId, sourceLessonPlanId, questionCount }) {
      const teacherId = await teacher(credential);
      if (!requestId || requestId.length > 128 || !sourceLessonPlanId
        || !WEEKLY_QUESTION_COUNTS.includes(questionCount)) throw fail('invalid_request');
      const source = await trustedSource(teacherId, sourceLessonPlanId);
      const fingerprint = hash(JSON.stringify([sourceLessonPlanId, questionCount, source.sourceHash]));
      try { return await repository.transaction(async tx => {
        const receiptKey = `${teacherId}:${requestId}`;
        const prior = await tx.getReceipt(receiptKey);
        if (prior) {
          if (prior.fingerprint !== fingerprint) throw fail('idempotency_conflict');
          return publicJob(await owned(tx, prior.jobId, teacherId));
        }
        const job = { id: newId(), version: JOB_VERSION, teacherId, sourceLessonPlanId,
          sourceHash: source.sourceHash, sourceVersion: source.sourceVersion,
          plan: source.plan, sources: source.sources, questionCount,
          collectionId: newId(), worksheetIds: DAYS.map(() => newId()),
          createdAt: new Date(now()).toISOString(), status: 'QUEUED', revision: 1,
          plannedProviderCalls: 5 * questionCount / BATCH_SIZE, attemptedProviderCalls: 0,
          checkpoints: [], lease: null, retryAfter: null, failureCategory: null, cancelRequested: false };
        if (repository.durable === true && (typeof tx.verifySource !== 'function'
          || !(await tx.verifySource(job)))) throw fail('source_changed');
        await tx.putJob(job);
        await tx.putReceipt(receiptKey, { fingerprint, jobId: job.id });
        return publicJob(job);
      }); } catch (error) {
        if (error?.code !== 'idempotency_conflict') throw error;
        return repository.transaction(async tx => {
          const prior = await tx.getReceipt(`${teacherId}:${requestId}`);
          if (!prior || prior.fingerprint !== fingerprint) throw fail('idempotency_conflict');
          return publicJob(await owned(tx, prior.jobId, teacherId));
        });
      }
    },
    async status(credential, jobId) {
      const teacherId = await teacher(credential);
      return repository.transaction(async tx => {
        const job = await owned(tx, jobId, teacherId);
        const saved = job.status === 'COMPLETED' && repository.durable === true
          && Boolean(await tx.getCollection(job.collectionId));
        const result = publicJob(job);
        return { ...result, saved,
          collectionId: repository.durable === true && !saved ? null : result.collectionId };
      });
    },
    async listJobs(credential) {
      const teacherId = await teacher(credential);
      return repository.transaction(async tx => {
        const savedIds = new Set(repository.durable === true
          ? await tx.listSavedCollectionIds(teacherId) : []);
        return (await tx.listJobs(teacherId)).map(job => {
          const saved = job.status === 'COMPLETED' && savedIds.has(job.collectionId);
          const result = publicJob(job);
          return { ...result, saved,
            collectionId: repository.durable === true && !saved ? null : result.collectionId };
        });
      });
    },
    async cancel(credential, jobId) {
      const teacherId = await teacher(credential);
      return repository.transaction(async tx => {
        const job = await owned(tx, jobId, teacherId);
        if (['COMPLETED', 'CANCELED'].includes(job.status)) return publicJob(job);
        if (job.status === 'RUNNING') job.cancelRequested = true;
        else job.status = 'CANCELED';
        job.revision += 1; await tx.putJob(job);
        return publicJob(job);
      });
    },
    async resume(credential, jobId) {
      const teacherId = await teacher(credential);
      return repository.transaction(async tx => {
        const job = await owned(tx, jobId, teacherId);
        if (job.status !== 'WAITING_FOR_CAPACITY' || (job.retryAfter && now() < Date.parse(job.retryAfter)))
          throw fail('resume_unavailable');
        job.status = 'QUEUED'; job.retryAfter = null; job.revision += 1; await tx.putJob(job);
        return publicJob(job);
      });
    },
    // A trusted, explicitly scheduled worker invokes one batch per request.
    async runStep(jobId, workerId) {
      if (!workerId) throw fail('worker_denied');
      const claim = await repository.transaction(async tx => {
        const job = await tx.getJob(jobId);
        if (!job) throw fail('not_found');
        if (job.status === 'RUNNING' && job.lease?.expiresAt <= now()) {
          job.status = 'INTERRUPTED_UNKNOWN_OUTCOME'; job.lease = null;
          job.revision += 1; await tx.putJob(job);
          return null;
        }
        if (job.status !== 'QUEUED') return null;
        const index = job.checkpoints.length;
        if (index >= job.plannedProviderCalls) throw fail('invalid_state');
        const token = newId();
        job.status = 'RUNNING'; job.attemptedProviderCalls += 1;
        job.lease = { workerId, token, index, expiresAt: now() + LEASE_MS };
        job.revision += 1; await tx.putJob(job);
        return { job, token, index };
      });
      if (!claim) return false;
      const { job, token, index } = claim;
      const batchesPerDay = job.questionCount / BATCH_SIZE;
      const source = job.sources[Math.floor(index / batchesPerDay)];
      const batch = index % batchesPerDay + 1;
      const previous = job.checkpoints.filter(entry => entry.day === source.day)
        .flatMap(entry => entry.questions);
      let raw; let failure;
      try {
        raw = await generateText(buildWeeklyWorksheetPrompt(job.plan, source, BATCH_SIZE, batch, previous),
          { maxOutputTokens: 8192, responseSchema: RESPONSE_SCHEMA });
        parseDailyBatch(raw, job.plan, source, BATCH_SIZE, batch);
      } catch (error) { failure = error; }
      const result = await repository.transaction(async tx => {
        const current = await tx.getJob(jobId);
        if (current.status !== 'RUNNING' || current.lease?.token !== token) return false;
        if (current.lease.expiresAt <= now()) {
          current.status = 'INTERRUPTED_UNKNOWN_OUTCOME'; current.lease = null;
          current.revision += 1; await tx.putJob(current);
          return publicJob(current);
        }
        if (current.cancelRequested) current.status = 'CANCELED';
        else if (failure) {
          const category = failure.validation?.category || failure.code;
          current.failureCategory = SAFE_FAILURES.has(category) ? category : 'unknown';
          current.status = ['PROVIDER_RATE_LIMIT', 'PROVIDER_DAILY_QUOTA', 'PROVIDER_OVERLOADED'].includes(failure.code)
            ? 'WAITING_FOR_CAPACITY' : failure.code === 'PROVIDER_INTERRUPTED' || failure.code === 'PROVIDER_TIMEOUT'
              ? 'INTERRUPTED_UNKNOWN_OUTCOME' : failure.validation ? 'FAILED_VALIDATION' : 'FAILED_PROVIDER';
          if (current.status === 'WAITING_FOR_CAPACITY' && failure.retryAfterSeconds)
            current.retryAfter = new Date(now() + failure.retryAfterSeconds * 1000).toISOString();
        } else {
          current.checkpoints.push({ day: source.day, batch, raw,
            questions: JSON.parse(raw).questions.map(item => item.question) });
          current.status = current.checkpoints.length === current.plannedProviderCalls ? 'READY_TO_COMMIT' : 'QUEUED';
        }
        current.lease = null; current.revision += 1; await tx.putJob(current);
        return publicJob(current);
      });
      return result?.status === 'READY_TO_COMMIT' ? service.commit(jobId) : result;
    },
    async commit(jobId) {
      const job = await repository.transaction(tx => tx.getJob(jobId));
      if (job?.status === 'COMPLETED') return {
        ...publicJob(job), durable: repository.durable === true
          && Boolean(await repository.transaction(tx => tx.getCollection(job.collectionId))) };
      if (!job || job.status !== 'READY_TO_COMMIT') throw fail('invalid_state');
      const source = await trustedSource(job.teacherId, job.sourceLessonPlanId);
      if (source.sourceHash !== job.sourceHash || source.sourceVersion !== job.sourceVersion) {
        await repository.transaction(async tx => {
          const current = await tx.getJob(jobId);
          if (current.status === 'READY_TO_COMMIT' && current.revision === job.revision) {
            current.status = 'FAILED_VALIDATION'; current.failureCategory = 'source_changed';
            current.revision += 1; await tx.putJob(current);
          }
        });
        throw fail('source_changed');
      }
      let index = 0;
      let drafts;
      try {
        drafts = await generateWeeklyWorksheetDrafts(job.plan, job.sources, { questionCount: job.questionCount,
          generateText: async () => job.checkpoints[index++]?.raw });
      } catch (error) {
        await repository.transaction(async tx => {
          const current = await tx.getJob(jobId);
          if (current.status === 'READY_TO_COMMIT' && current.revision === job.revision) {
            current.status = 'FAILED_VALIDATION';
            current.failureCategory = SAFE_FAILURES.has(error.validation?.category) ? error.validation.category : 'unknown';
            current.revision += 1; await tx.putJob(current);
          }
        });
        throw error;
      }
      const collection = { id: job.collectionId, ownerId: job.teacherId, sourceLessonPlanId: job.sourceLessonPlanId,
        status: 'Draft', revision: 1, createdAt: job.createdAt, worksheets: drafts.map((draft, day) => ({
          ...draft, id: job.worksheetIds[day], collectionId: job.collectionId, status: 'Draft', revision: 1,
          checkingMode: 'manual',
          sections: [{ id: `${job.worksheetIds[day]}:group-1`, title: 'Questions', directions: '' }],
          questions: draft.questions.map((question, position) => ({ ...question,
            localId: `${job.worksheetIds[day]}:${position + 1}`,
            sectionId: `${job.worksheetIds[day]}:group-1` })),
          answerKey: draft.answerKey.map(key => ({ ...key,
            localId: `${job.worksheetIds[day]}:${Number(key.localId.slice(6))}` })),
        })) };
      return repository.transaction(async tx => {
        const current = await tx.getJob(jobId);
        if (current.status === 'COMPLETED') return { ...publicJob(current),
          durable: repository.durable === true && Boolean(await tx.getCollection(current.collectionId)) };
        if (current.status !== 'READY_TO_COMMIT' || current.revision !== job.revision) throw fail('revision_conflict');
        if (repository.durable === true && (typeof tx.verifySource !== 'function'
          || !(await tx.verifySource(current)))) throw fail('source_changed');
        if (await tx.getCollection(collection.id)) throw fail('identity_conflict');
        await tx.putCollection(collection);
        current.status = 'COMPLETED'; current.revision += 1; await tx.putJob(current);
        return { ...publicJob(current), durable: repository.durable === true };
      });
    },
    async openCollection(credential, collectionId) {
      const teacherId = await teacher(credential);
      return repository.transaction(async tx => {
        const collection = await tx.getCollection(collectionId);
        if (!collection || collection.ownerId !== teacherId) throw fail('not_found');
        return collection;
      });
    },
    async listCollections(credential) {
      const teacherId = await teacher(credential);
      return repository.transaction(async tx => {
        const collections = await tx.listCollections(teacherId);
        return collections.map(collection => ({ id: collection.id, status: collection.status,
          revision: collection.revision, sourceLessonPlanId: collection.sourceLessonPlanId,
          createdAt: collection.createdAt, durable: repository.durable === true,
          days: collection.worksheets.map(item => ({
            id: item.id, day: item.day, title: item.title, status: item.status, revision: item.revision,
            questionCount: item.questions.length })) }));
      });
    },
    async updateDaily(credential, collectionId, worksheet, expectedRevision) {
      const teacherId = await teacher(credential);
      return repository.transaction(async tx => {
        const collection = await tx.getCollection(collectionId);
        if (!collection || collection.ownerId !== teacherId) throw fail('not_found');
        const index = collection.worksheets.findIndex(item => item.id === worksheet?.id);
        if (index < 0 || collection.status !== 'Draft' || collection.worksheets[index].status !== 'Draft')
          throw fail('invalid_state');
        if (collection.worksheets[index].revision !== expectedRevision) throw fail('revision_conflict');
        const previous = collection.worksheets[index];
        if (worksheet.day !== DAYS[index] || worksheet.collectionId !== collectionId
          || worksheet.sourceLessonPlan?.id !== collection.sourceLessonPlanId
          || worksheet.questions?.length !== previous.questions.length
          || worksheet.questions.some((item, position) => item.localId !== previous.questions[position].localId)
          || worksheet.answerKey?.length !== worksheet.questions.filter(item => item.item_type !== 'essay').length)
          throw fail('invalid_document');
        if (!['auto', 'manual'].includes(worksheet.checkingMode)
          || !Array.isArray(worksheet.sections) || !worksheet.sections.length
          || new Set(worksheet.sections.map(section => section.id)).size !== worksheet.sections.length
          || worksheet.sections.some(section => typeof section.id !== 'string' || !section.id
            || section.id.length > 128 || typeof section.title !== 'string' || !section.title.trim()
            || section.title.length > 120 || typeof section.directions !== 'string'
            || section.directions.length > 2000)
          || worksheet.questions.some(item => !worksheet.sections.some(section => section.id === item.sectionId))
          || (worksheet.checkingMode === 'auto' && worksheet.questions.some(item =>
            item.item_type === 'enumeration' && (item.enumeration?.orderSensitive
              || item.enumeration?.alternatives?.length)))) throw fail('invalid_document');
        const keys = new Map(worksheet.answerKey.map(key => [key.localId, key.correct_answer]));
        if (keys.size !== worksheet.answerKey.length || worksheet.answerKey.some(key =>
          !worksheet.questions.some(item => item.localId === key.localId && item.item_type !== 'essay')))
          throw fail('invalid_document');
        const seen = new Set();
        for (let batch = 0; batch < worksheet.questions.length / BATCH_SIZE; batch += 1) {
          const entries = worksheet.questions.slice(batch * BATCH_SIZE, (batch + 1) * BATCH_SIZE);
          parseDailyBatch(JSON.stringify({ title: worksheet.title, directions: worksheet.instructions,
            questions: entries.map(item => ({ ...item, correct_answer: keys.get(item.localId) ?? '' })) }),
          { id: collection.sourceLessonPlanId, title: collection.sourceLessonPlanId },
          { day: worksheet.day }, BATCH_SIZE, batch + 1);
          for (const item of entries) {
            const normalized = item.question.toLocaleLowerCase().replace(/\s+/g, ' ');
            if (seen.has(normalized)) throw fail('invalid_document');
            seen.add(normalized);
          }
        }
        if (collection.worksheets.some((other, otherIndex) => otherIndex !== index && other.questions.some(item =>
          seen.has(item.question.toLocaleLowerCase().replace(/\s+/g, ' '))))) throw fail('invalid_document');
        collection.worksheets[index] = { ...previous, title: worksheet.title, instructions: worksheet.instructions,
          checkingMode: worksheet.checkingMode,
          sections: worksheet.sections.map(section => ({ id: section.id, title: section.title,
            directions: section.directions })),
          questions: worksheet.questions.map(item => ({ localId: item.localId, sectionId: item.sectionId,
            question: item.question, item_type: item.item_type, points: item.points, options: item.options,
            ...(item.enumeration ? { enumeration: item.enumeration } : {}),
            ...(item.essay ? { essay: item.essay } : {}) })),
          answerKey: worksheet.answerKey.map(key => ({ localId: key.localId, correct_answer: key.correct_answer })),
          revision: expectedRevision + 1 };
        collection.revision += 1; await tx.putCollection(collection);
        return { worksheet: collection.worksheets[index], durable: repository.durable === true };
      });
    },
    async changeArchive(credential, collectionId, { worksheetId = null, archived, expectedRevision }) {
      const teacherId = await teacher(credential);
      if (typeof archived !== 'boolean') throw fail('invalid_request');
      return repository.transaction(async tx => {
        const collection = await tx.getCollection(collectionId);
        if (!collection || collection.ownerId !== teacherId) throw fail('not_found');
        const target = worksheetId ? collection.worksheets.find(item => item.id === worksheetId) : collection;
        if (!target) throw fail('not_found');
        if (target.revision !== expectedRevision) throw fail('revision_conflict');
        if (typeof tx.hasAssessmentReferences !== 'function' || await tx.hasAssessmentReferences(collectionId, worksheetId))
          throw fail('assessed_record_protected');
        if (!['Draft', 'Archived'].includes(target.status)) throw fail('invalid_state');
        target.status = archived ? 'Archived' : 'Draft';
        target.revision += 1;
        if (worksheetId) collection.revision += 1;
        await tx.putCollection(collection);
        return { id: target.id, status: target.status, revision: target.revision,
          durable: repository.durable === true };
      });
    },
    async deleteEligibleDraft(credential, collectionId, expectedRevision) {
      const teacherId = await teacher(credential);
      return repository.transaction(async tx => {
        const collection = await tx.getCollection(collectionId);
        if (!collection || collection.ownerId !== teacherId) throw fail('not_found');
        if (collection.revision !== expectedRevision) throw fail('revision_conflict');
        if (collection.status !== 'Draft' || collection.worksheets.some(item => item.status !== 'Draft')
          || typeof tx.hasAssessmentReferences !== 'function'
          || await tx.hasAssessmentReferences(collectionId, null)) throw fail('assessed_record_protected');
        await tx.deleteCollection(collectionId);
        return { deleted: true, durable: repository.durable === true };
      });
    },
  });
  return service;
}
