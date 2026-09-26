// ============================================
// FILE: backend/src/lib/gemini.js
// The Gemini call. The API key is read here and never leaves this process.
//
// Moved out of the browser because an API key cannot be protected there:
// Vite inlines every VITE_* variable into the shipped bundle, so the key was
// readable by anyone who opened the teacher dashboard — and it is billable.
// ============================================

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Large PDFs and long structured output need room. Kept generous rather than
// tight: a timeout that fires on a slow-but-working request reports a
// working system as a broken one.
const TIMEOUT_MS = 90_000;
const RETRY_DELAY_MS = 2_000;

/**
 * Sends a PDF and the prompt to Gemini, returns the generated HTML.
 *
 * @param {string} base64Pdf
 * @param {string} prompt
 * @returns {Promise<{html: string, truncated: boolean}>}
 *   `truncated` means the model ran out of output space partway. The plan is
 *   still returned: a teacher can finish an incomplete plan, and discarding
 *   it would throw away a minute of generation over an editable gap.
 */
async function callOnce(base64Pdf, prompt, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: 'application/pdf', data: base64Pdf } },
            { text: prompt },
          ],
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 65536,
          // A structured-HTML fill-in task, not a reasoning task. Turning
          // "thinking" off gives the whole token budget to the actual
          // output, which is what was causing intermittent MAX_TOKENS
          // cutoffs on longer PDFs.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      // The upstream message is kept for the log, not forwarded to the
      // client — a Gemini error can carry the key or project details.
      const detail = body?.error?.message || `HTTP ${response.status}`;
      const err = new Error(`Gemini request failed: ${detail}`);
      err.status = response.status;
      throw err;
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0];
    if (!candidate) throw new Error('Gemini returned no candidates.');

    const text = candidate?.content?.parts?.[0]?.text || '';
    const finishReason = candidate?.finishReason;

    if (!text) {
      throw new Error(finishReason === 'MAX_TOKENS'
        ? 'Gemini ran out of output space before writing anything usable. Try a shorter or simpler PDF.'
        : 'Gemini returned an empty response.');
    }

    const html = text.replace(/```html/gi, '').replace(/```/g, '').trim();
    return { html, truncated: finishReason === 'MAX_TOKENS' };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Gemini timed out after ${TIMEOUT_MS / 1000} seconds. Try a smaller PDF.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateLessonPlan(base64Pdf, prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  // Deliberately NOT named VITE_GEMINI_API_KEY. That prefix is what put this
  // key in the browser bundle in the first place, and a copy-paste of the old
  // name into a frontend .env would quietly do it again.
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set on the server.');

  // Rate limits and network blips are common on the free tier; one retry
  // recovers most of them rather than failing a teacher's upload outright.
  try {
    return await callOnce(base64Pdf, prompt, apiKey);
  } catch (err) {
    console.warn('[gemini] first attempt failed, retrying once —', err.message);
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    return callOnce(base64Pdf, prompt, apiKey);
  }
}
