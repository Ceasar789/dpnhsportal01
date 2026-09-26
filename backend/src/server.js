// ============================================
// FILE: backend/src/server.js
// Entry point. `npm start -w backend`.
// ============================================

import { createApp } from './app.js';

const PORT = process.env.PORT || 3001;

// Fail loudly at boot rather than on the first request. A service that
// starts, passes its health check and then fails every real call is harder
// to diagnose than one that refuses to start.
const REQUIRED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY'];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`Cannot start: missing ${missing.join(', ')}. See backend/.env.example.`);
  process.exit(1);
}

const server = createApp().listen(PORT, () => {
  console.log(`EduScribe API listening on http://localhost:${PORT}`);
});

// Without a handler, a port already in use throws an unhandled 'error' event
// and prints eleven lines of stack trace for a one-line problem — which
// during development is nearly always a server from the last run still
// holding the port.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Another copy of this server `
      + 'is probably still running — stop it, or set PORT to something else.');
    process.exit(1);
  }
  throw err;
});
