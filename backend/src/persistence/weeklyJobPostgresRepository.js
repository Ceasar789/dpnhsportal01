// Direct PostgreSQL transaction adapter for the review-only weekly schema.
// A verified, narrowly privileged Pool must be injected; production does not
// construct or mount this repository until its SQL and worker role are approved.
import { createHash } from 'node:crypto';
const conflict = code => Object.assign(new Error(code), { code });

export function createWeeklyJobPostgresRepository({ pool } = {}) {
  if (typeof pool?.connect !== 'function') throw conflict('integration_blocked');
  return {
    atomic: true, durable: true,
    async transaction(callback) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const seenJobs = new Map();
        const seenCollections = new Map();
        const one = async (sql, values) => (await client.query(sql, values)).rows[0] || null;
        const tx = {
          async getJob(id) {
            const row = await one('SELECT revision, private_state FROM public.weekly_worksheet_jobs WHERE id = $1 FOR UPDATE', [id]);
            if (!row) return null;
            seenJobs.set(id, Number(row.revision));
            const checkpoints = (await client.query(
              'SELECT day_name, batch_number, validated_response FROM public.weekly_worksheet_checkpoints WHERE job_id = $1 ORDER BY batch_index',
              [id])).rows.map(entry => ({ day: entry.day_name, batch: entry.batch_number,
              raw: JSON.stringify(entry.validated_response),
              questions: entry.validated_response.questions.map(item => item.question) }));
            return { ...row.private_state, revision: Number(row.revision), checkpoints };
          },
          async listJobs(teacherId) {
            const rows = (await client.query(`SELECT j.private_state, j.revision,
              (SELECT count(*)::integer FROM public.weekly_worksheet_checkpoints c WHERE c.job_id = j.id) AS completed
              FROM public.weekly_worksheet_jobs j WHERE j.teacher_id = $1 ORDER BY j.created_at DESC LIMIT 50`,
            [teacherId])).rows;
            return rows.map(row => ({ ...row.private_state, revision: Number(row.revision),
              checkpoints: Array.from({ length: row.completed }) }));
          },
          async putJob(job) {
            const { checkpoints, ...state } = job;
            const values = [job.id, job.teacherId, job.sourceLessonPlanId, job.sourceHash,
              job.sourceVersion, JSON.stringify(job.sources), JSON.stringify(job.plan),
              JSON.stringify(state), job.version, job.questionCount, job.status,
              job.plannedProviderCalls, job.attemptedProviderCalls, job.revision,
              job.lease?.token || null, job.lease?.workerId || null,
              job.lease ? new Date(job.lease.expiresAt) : null, job.lease?.index ?? null,
              job.cancelRequested, job.retryAfter, job.failureCategory, job.collectionId,
              job.worksheetIds];
            if (seenJobs.has(job.id)) {
              const result = await client.query(`UPDATE public.weekly_worksheet_jobs SET
                source_sha256 = decode($4, 'hex'), source_version = $5, source_days = $6::jsonb,
                plan_snapshot = $7::jsonb, private_state = $8::jsonb, status = $11,
                attempted_calls = $13, revision = $14, lease_token = $15, lease_worker = $16,
                lease_expires_at = $17, active_batch = $18, cancel_requested = $19,
                retry_after = $20, failure_category = $21, updated_at = now()
                WHERE id = $1 AND revision = $24`, [...values, seenJobs.get(job.id)]);
              if (result.rowCount !== 1) throw conflict('revision_conflict');
              seenJobs.set(job.id, job.revision);
            } else {
              await client.query(`INSERT INTO public.weekly_worksheet_jobs
                (id, teacher_id, source_lesson_plan_id, source_sha256, source_version,
                source_days, plan_snapshot, private_state, job_version, question_count,
                status, planned_calls, attempted_calls, revision, lease_token, lease_worker,
                lease_expires_at, active_batch, cancel_requested, retry_after,
                failure_category, collection_id, worksheet_ids)
                VALUES ($1,$2,$3,decode($4,'hex'),$5,$6::jsonb,$7::jsonb,$8::jsonb,
                $9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`, values);
              seenJobs.set(job.id, job.revision);
            }
            for (const [index, entry] of checkpoints.entries()) {
              const result = await client.query(`INSERT INTO public.weekly_worksheet_checkpoints
                (job_id, batch_index, day_name, batch_number, validated_response)
                VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (job_id,batch_index) DO NOTHING`,
              [job.id, index, entry.day, entry.batch, entry.raw]);
              if (!result.rowCount) {
                const prior = await one(`SELECT validated_response FROM public.weekly_worksheet_checkpoints
                  WHERE job_id = $1 AND batch_index = $2`, [job.id, index]);
                if (JSON.stringify(prior?.validated_response) !== entry.raw)
                  throw conflict('checkpoint_conflict');
              }
            }
          },
          async getReceipt(key) {
            const separator = key.indexOf(':');
            const teacherId = key.slice(0, separator);
            const requestId = key.slice(separator + 1);
            const row = await one(`SELECT encode(fingerprint,'hex') AS fingerprint, job_id
              FROM public.weekly_worksheet_job_receipts WHERE teacher_id = $1 AND request_id = $2 FOR UPDATE`,
            [teacherId, requestId]);
            return row && { fingerprint: row.fingerprint, jobId: row.job_id };
          },
          async putReceipt(key, receipt) {
            const separator = key.indexOf(':');
            const teacherId = key.slice(0, separator);
            const requestId = key.slice(separator + 1);
            const result = await client.query(`INSERT INTO public.weekly_worksheet_job_receipts
              (teacher_id, request_id, fingerprint, job_id)
              VALUES ($1,$2,decode($3,'hex'),$4) ON CONFLICT DO NOTHING`,
            [teacherId, requestId, receipt.fingerprint, receipt.jobId]);
            if (result.rowCount !== 1) throw conflict('idempotency_conflict');
          },
          async getCollection(id) {
            const row = await one(`SELECT revision, private_document FROM public.weekly_worksheet_collections
              WHERE id = $1 FOR UPDATE`, [id]);
            if (!row) return null;
            seenCollections.set(id, { revision: Number(row.revision),
              days: new Map(row.private_document.worksheets.map(item => [item.id, item.revision])) });
            return { ...row.private_document, revision: Number(row.revision) };
          },
          async verifySource(job) {
            const row = await one(`SELECT teacher_id, ai_generated, objectives, title,
              authoring_revision, updated_at FROM public.lesson_plans WHERE id = $1 FOR SHARE`,
            [job.sourceLessonPlanId]);
            if (!row || row.teacher_id !== job.teacherId || row.ai_generated !== true || !row.title?.trim())
              return false;
            const digest = createHash('sha256').update(row.objectives || '').digest('hex');
            return digest === job.sourceHash
              && String(row.authoring_revision || digest) === job.sourceVersion;
          },
          async listCollections(teacherId) {
            const rows = (await client.query(`SELECT revision, private_document
              FROM public.weekly_worksheet_collections WHERE teacher_id = $1 ORDER BY created_at DESC`,
            [teacherId])).rows;
            return rows.map(row => ({ ...row.private_document, revision: Number(row.revision) }));
          },
          async listSavedCollectionIds(teacherId) {
            return (await client.query(`SELECT id FROM public.weekly_worksheet_collections
              WHERE teacher_id = $1`, [teacherId])).rows.map(row => row.id);
          },
          async putCollection(collection) {
            const payload = JSON.stringify(collection);
            if (seenCollections.has(collection.id)) {
              const result = await client.query(`UPDATE public.weekly_worksheet_collections
                SET status = $2, revision = $3, private_document = $4::jsonb
                WHERE id = $1 AND revision = $5`,
              [collection.id, collection.status, collection.revision, payload,
                seenCollections.get(collection.id).revision]);
              if (result.rowCount !== 1) throw conflict('revision_conflict');
              const prior = seenCollections.get(collection.id);
              for (const [index, item] of collection.worksheets.entries()) {
                const updated = await client.query(`UPDATE public.weekly_worksheet_daily_drafts
                  SET status = $2, revision = $3, private_document = $4::jsonb
                  WHERE id = $1 AND collection_id = $5 AND weekday = $6 AND revision = $7`,
                [item.id, item.status, item.revision, JSON.stringify(item), collection.id,
                  index + 1, prior.days.get(item.id)]);
                if (updated.rowCount !== 1) throw conflict('revision_conflict');
                const worksheet = await client.query(`UPDATE public.worksheets
                  SET title = $2, status = $3 WHERE id = $1 AND teacher_id = $4`,
                [item.id, item.title, item.status, collection.ownerId]);
                if (worksheet.rowCount !== 1) throw conflict('revision_conflict');
              }
              seenCollections.set(collection.id, { revision: collection.revision,
                days: new Map(collection.worksheets.map(item => [item.id, item.revision])) });
            } else {
              await client.query(`INSERT INTO public.weekly_worksheet_collections
                (id, teacher_id, source_lesson_plan_id, job_id, status, revision, private_document)
                VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
              [collection.id, collection.ownerId, collection.sourceLessonPlanId,
                (await one('SELECT id FROM public.weekly_worksheet_jobs WHERE collection_id = $1',
                  [collection.id]))?.id, collection.status, collection.revision, payload]);
              for (const [index, item] of collection.worksheets.entries()) {
                await client.query(`INSERT INTO public.worksheets
                  (id, teacher_id, title, subject, grade_level, status)
                  VALUES ($1,$2,$3,$4,$5,'Draft')`,
                [item.id, collection.ownerId, item.title, item.subjectName || null, item.gradeLevel || null]);
                await client.query(`INSERT INTO public.weekly_worksheet_daily_drafts
                  (id, collection_id, weekday, status, revision, private_document)
                  VALUES ($1,$2,$3,'Draft',1,$4::jsonb)`,
                [item.id, collection.id, index + 1, JSON.stringify(item)]);
              }
              seenCollections.set(collection.id, { revision: collection.revision,
                days: new Map(collection.worksheets.map(item => [item.id, item.revision])) });
            }
          },
          async hasAssessmentReferences(collectionId, worksheetId) {
            const row = await one(`SELECT EXISTS (
              SELECT 1 FROM public.weekly_worksheet_daily_drafts d
              WHERE d.collection_id = $1 AND ($2::uuid IS NULL OR d.id = $2)
              AND (EXISTS (SELECT 1 FROM public.worksheet_sections s WHERE s.worksheet_id = d.id)
                OR EXISTS (SELECT 1 FROM public.task_assignees a WHERE a.task_id = d.id)
                OR EXISTS (SELECT 1 FROM public.worksheet_submissions u WHERE u.worksheet_id = d.id))
              ) AS protected`, [collectionId, worksheetId]);
            return row?.protected !== false;
          },
          async deleteCollection(id) {
            const collection = await this.getCollection(id);
            if (!collection) throw conflict('not_found');
            for (const item of collection.worksheets) {
              await client.query('DELETE FROM public.weekly_worksheet_daily_drafts WHERE id = $1', [item.id]);
              await client.query('DELETE FROM public.worksheets WHERE id = $1', [item.id]);
            }
            await client.query('DELETE FROM public.weekly_worksheet_collections WHERE id = $1', [id]);
          },
        };
        const result = await callback(tx);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },
  };
}
