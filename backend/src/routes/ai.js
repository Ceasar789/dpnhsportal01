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

// The same 20MB ceiling the upload form enforces. Checked again here because
// the form is not the only thing that can call this endpoint, and every
// megabyte past the limit is billed whether or not the browser meant to send
// it. Base64 inflates by about a third, hence the multiplier.
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil(MAX_PDF_BYTES * 1.37);

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
    return res.status(413).json({ error: 'That PDF is too large. The limit is 20MB.' });
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
