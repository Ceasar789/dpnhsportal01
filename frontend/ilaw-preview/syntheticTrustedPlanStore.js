import { authorizeManualWrite } from './trustedWriteContract';

// In-memory rehearsal only. The future PostgreSQL operation must provide
// transaction locking, durable idempotency, and effective grant/RLS enforcement.
export function createSyntheticTrustedPlanStore(initialRows = []) {
  const rows = new Map(initialRows.map(row => [row.id, structuredClone(row)]));
  const requests = new Map();
  const copy = value => structuredClone(value);

  function writeManual({ context, payload, operation, expectedRevision, requestId, instant, loseResponse = false }) {
    if (typeof requestId !== 'string' || !requestId.trim()) return { authorized: false, code: 'invalid_payload' };
    const key = `${context?.authUserId ?? ''}:${requestId}`;
    const fingerprint = JSON.stringify({ payload, operation, expectedRevision });
    const prior = requests.get(key);
    if (prior) return prior.fingerprint === fingerprint
      ? { authorized: true, code: 'reconciled', row: copy(prior.row) }
      : { authorized: false, code: 'request_conflict' };

    const existing = rows.get(payload?.planId) ?? null;
    const result = authorizeManualWrite({ context, payload, operation, existing, expectedRevision, instant });
    if (!result.authorized) return result;
    const row = {
      id: result.payload.planId,
      teacher_id: context.authUserId,
      title: result.payload.title,
      subject: result.payload.assignment.subjectName,
      grade_level: result.payload.assignment.gradeLevel,
      objectives: JSON.stringify(result.payload),
      ai_generated: false,
      status: result.privateStatus,
      revision: result.nextRevision, // Synthetic only; deployed column is unverified.
    };
    rows.set(row.id, row);
    requests.set(key, { fingerprint, row: copy(row) });
    if (loseResponse) return { authorized: false, code: 'ambiguous_response', requestId };
    return { authorized: true, code: 'authorized', row: copy(row) };
  }

  function reconcile({ authUserId, requestId }) {
    const result = requests.get(`${authUserId ?? ''}:${requestId}`);
    return result ? copy(result.row) : null;
  }

  return { writeManual, reconcile, getRow: id => rows.has(id) ? copy(rows.get(id)) : null,
    listRows: () => [...rows.values()].map(copy) };
}
