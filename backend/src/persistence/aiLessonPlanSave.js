import createDOMPurify from 'dompurify';
import { PersistenceError, identity, requireThat } from '../../../shared/trustedPersistence/contracts.js';
import { validateLessonPlanTitle } from '../../../frontend/src/pages/dashboards/teacher/lessonPlanTitle.js';

const MAX_HTML_BYTES = 128 * 1024;
let purifierPromise;
const classes = new Set([
  'ilaw-lesson-plan', 'ilaw-letterhead', 'ilaw-school-name', 'ilaw-school-address',
  'ilaw-title', 'ilaw-info-table', 'ilaw-section', 'ilaw-I', 'ilaw-L', 'ilaw-A',
  'ilaw-W', 'ilaw-section-header', 'ilaw-section-intro', 'ilaw-field', 'ilaw-label',
  'ilaw-label-hint', 'ilaw-week-table', 'ilaw-signatures', 'ilaw-sig-row',
  'ilaw-sig-col', 'ilaw-sig-tag', 'ilaw-sig-name', 'ilaw-sig-position',
  'ilaw-sig-noted', 'ilaw-empty-placeholder',
]);
async function getPurifier() {
  purifierPromise ??= import('jsdom').then(({ JSDOM }) => {
    const purifier = createDOMPurify(new JSDOM('').window);
    purifier.addHook('uponSanitizeAttribute', (_node, data) => {
      if (data.attrName !== 'class') return;
      const safe = data.attrValue.split(' ').filter(name => classes.has(name));
      if (safe.length) data.attrValue = safe.join(' ');
      else data.keepAttr = false;
    });
    return purifier;
  });
  return purifierPromise;
}

export async function sanitizeAiLessonPlanHtml(html) {
  requireThat(typeof html === 'string' && Buffer.byteLength(html, 'utf8') <= MAX_HTML_BYTES, 'payload_too_large');
  const purifier = await getPurifier();
  const safe = purifier.sanitize(html, {
    ALLOWED_TAGS: ['a', 'b', 'blockquote', 'br', 'col', 'colgroup', 'div', 'em', 'h1', 'h2',
      'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'li', 'ol', 'p', 'span', 'strong', 'sub', 'sup',
      'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul'],
    ALLOWED_ATTR: ['class', 'colspan', 'href', 'rowspan', 'title'],
    FORBID_TAGS: ['style'], FORBID_ATTR: ['style'], ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
  }).trim();
  requireThat(safe && Buffer.byteLength(safe, 'utf8') <= MAX_HTML_BYTES, 'invalid_document');
  return safe;
}

const fail = code => ({ ok: false, code, durable: false });
const dbCodes = new Set(['not_authenticated', 'inactive_teacher', 'idempotency_conflict',
  'invalid_document', 'payload_too_large']);
const uuid = value => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function createAiLessonPlanSave({ invokeRpc, diagnose = () => {} } = {}) {
  return {
    async availability(credential) {
      if (!invokeRpc) return fail('integration_blocked');
      try {
        requireThat(typeof credential === 'string' && credential, 'not_authenticated');
        const { data, error } = await invokeRpc('eduscribe_ai_save_assignments_v1', {}, credential);
        if (error) return fail(dbCodes.has(error.message) ? error.message : 'persistence_failed');
        requireThat(data?.ok === true && data.version === 2, 'persistence_failed');
        return { ok: true };
      } catch (error) {
        return fail(error instanceof PersistenceError ? error.code : 'persistence_failed');
      }
    },
    async save(credential, raw, ownerId) {
      if (!invokeRpc) {
        diagnose('transport_config', 'blocked');
        return fail('integration_blocked');
      }
      let stage = 'input_validation';
      try {
        requireThat(typeof credential === 'string' && credential, 'not_authenticated');
        requireThat(raw && typeof raw === 'object' && !Array.isArray(raw), 'invalid_document');
        const { requestId, title, html } = raw;
        requireThat(identity(requestId), 'invalid_document');
        const checked = validateLessonPlanTitle(title);
        requireThat(typeof title === 'string' && !checked.error, 'invalid_document');
        const safeHtml = await sanitizeAiLessonPlanHtml(html);
        stage = 'rpc_request';
        diagnose('rpc_request', 'attempted');
        const { data, error } = await invokeRpc('eduscribe_ai_html_save_v1', {
          p_request_id: requestId, p_title: checked.title, p_html: safeHtml,
        }, credential);
        if (error) {
          diagnose('rpc_rejection', dbCodes.has(error.message) ? error.message : 'unexpected', error.code);
          return fail(dbCodes.has(error.message) ? error.message : 'persistence_failed');
        }
        stage = 'receipt_validation';
        const validReceipt = data?.ok === true && data.durable === true && uuid(data.record?.id) &&
          data.record.teacher_id === ownerId &&
          (data.record.subject_id === null || uuid(data.record.subject_id)) &&
          (data.record.subject === null || typeof data.record.subject === 'string') &&
          (data.record.grade_level === null || typeof data.record.grade_level === 'string') &&
          (data.record.academic_year === null || /^\d{4}-\d{4}$/.test(data.record.academic_year)) &&
          data.record.ai_generated === true && data.record.status === 'draft' &&
          data.record.title === checked.title && data.record.objectives === safeHtml &&
          data.record.file_url === null && data.record.file_name === null && data.record.file_path === null;
        if (!validReceipt) diagnose('receipt_validation', 'invalid');
        requireThat(validReceipt, 'persistence_failed');
        return data;
      } catch (error) {
        if (stage === 'input_validation') diagnose('input_validation',
          error instanceof PersistenceError ? error.code : 'unexpected');
        if (stage === 'rpc_request') diagnose('rpc_request', 'exception');
        if (stage === 'receipt_validation' && !(error instanceof PersistenceError))
          diagnose('receipt_validation', 'exception');
        return fail(error instanceof PersistenceError ? error.code : 'persistence_failed');
      }
    },
  };
}
