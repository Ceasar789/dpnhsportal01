// ============================================
// FILE: backend/src/routes/ai.js
// POST /api/ai/lesson-plan
//
// Takes a PDF, returns an ILAW lesson plan as HTML. The Gemini key stays on
// this side of the wire.
// ============================================

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/requireAuth.js';
import { generateLessonPlan } from '../lib/gemini.js';
import { ILAW_PROMPT } from '../lib/ilawPrompt.js';

const router = Router();

// 3MB, because Vercel caps a serverless request body at 4.5MB before this
// code ever runs, and base64 inflates a file by about a third: 4.5 ÷ 1.37 is
// roughly 3.2. Set to 3 rather than 3.2 so the failure is ours, with a
// message that says what to do, instead of the platform's
// FUNCTION_PAYLOAD_TOO_LARGE, which says nothing a teacher can act on.
//
// A long-running host has no such cap. If this ever moves off serverless,
// this is the one number to raise — and the frontend reads it from the
// server rather than keeping its own copy, so raising it here is enough.
export const MAX_PDF_BYTES = 3 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil(MAX_PDF_BYTES * 1.37);

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);

// Generation is slow and metered. Without a cap, one stuck loop in a browser
// can spend the school's whole quota before anyone notices — and the bill
// arrives before the bug report does.
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Per teacher, not per IP: a whole school behind one router shares an
  // address, and an IP-keyed limit would have one teacher's work lock out
  // everyone else's.
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'You have generated a lot of lesson plans this hour. Try again later.' },
});

router.post('/lesson-plan', requireAuth(['teacher', 'admin', 'main_admin']), limiter, async (req, res) => {
  const { pdfBase64, fileName } = req.body || {};

  if (typeof pdfBase64 !== 'string' || pdfBase64.length === 0) {
    return res.status(400).json({ error: 'pdfBase64 is required.' });
  }
  if (pdfBase64.length > MAX_BASE64_CHARS) {
    // Names the actual size, the limit, and the usual cause. "Too large" on
    // its own leaves a teacher with no idea whether to try again, ask for
    // help, or give up — and the usual cause has a fix they can apply.
    const actual = Math.round(pdfBase64.length / 1.37);
    return res.status(413).json({
      error: `This PDF is ${mb(actual)}MB and the limit is ${mb(MAX_PDF_BYTES)}MB. `
        + 'Scanned documents are large because every page is an image — '
        + 'export the file as text from Word or Google Docs, or compress it, and try again.',
    });
  }
  // A data-URL prefix here means the caller sent the whole FileReader result
  // rather than just the payload. Rejected with a message that says which,
  // instead of forwarding it to Gemini and getting an opaque failure back.
  if (pdfBase64.startsWith('data:')) {
    return res.status(400).json({ error: 'Send the base64 payload only, without the data: URL prefix.' });
  }

  const started = Date.now();
  try {
    const { html, truncated } = await generateLessonPlan(pdfBase64, ILAW_PROMPT);
    console.log(`[ai] lesson plan for ${req.user.email} (${fileName || 'unnamed'}) `
      + `in ${((Date.now() - started) / 1000).toFixed(1)}s${truncated ? ' (truncated)' : ''}`);
    res.json({ html, truncated });
  } catch (err) {
    // The generated message is written for the teacher and carries no
    // upstream detail; the full error goes to the log, where a key or a
    // project id in an upstream message cannot reach the browser.
    console.error(`[ai] generation failed for ${req.user.email} —`, err);
    res.status(502).json({ error: err.message || 'Lesson plan generation failed. Try again.' });
  }
});

export default router;
