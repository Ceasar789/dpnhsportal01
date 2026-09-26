// ============================================
// FILE: backend/src/lib/ilawPrompt.js
// The ILAW lesson plan prompt — DepEd Order No. 3, s. 2026.
//
// This is business logic, not a string constant. It encodes the ILAW
// framework, the required letterhead, the five-day structure, and the exact
// HTML class names the renderer depends on. It lived in the browser only
// because the API key did; both belong here.
//
// Kept in ilaw-prompt.txt rather than inline. Nine thousand characters of
// HTML and backslashes inside a template literal needs escaping, and the
// first attempt at that silently dropped 160 characters of the DepEd format
// — a corruption that would have shown up as a subtly wrong lesson plan,
// weeks later, with nothing pointing at the cause. A text file has no
// escaping to get wrong, and it diffs properly when the format changes.
// ============================================

import fs from 'node:fs';

export const ILAW_PROMPT = fs.readFileSync(
  new URL('./ilaw-prompt.txt', import.meta.url),
  'utf8'
);
