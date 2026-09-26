// ============================================
// FILE: backend/src/app.js
// The Express application.
//
// Deliberately small. This service exists to hold the credentials a browser
// cannot hold — the Gemini key, and later the Supabase service role. Data
// reads and writes keep going straight to Supabase, where Row Level Security
// enforces access per query rather than per route. Forty-one policies
// re-expressed as `if` statements here would be more code and fewer
// guarantees.
// ============================================

import express from 'express';
import cors from 'cors';
import aiRoutes from './routes/ai.js';

export function createApp() {
  const app = express();

  // Only the app's own origins may call this. Left open, any page on the
  // internet could spend the school's Gemini quota using a logged-in
  // teacher's session.
  const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',').map(s => s.trim()).filter(Boolean);
  app.use(cors({ origin: origins, credentials: false }));

  // A base64 PDF is bulky; express defaults to 100kb and would reject every
  // real upload. Sized to the same 20MB ceiling the route enforces, plus
  // base64 overhead and room for the rest of the envelope.
  app.use(express.json({ limit: '30mb' }));

  app.disable('x-powered-by');

  // For the host's health check, and for answering "is the API even up?"
  // without needing a login.
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'eduscribe-api' }));

  app.use('/api/ai', aiRoutes);

  app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));

  // Last resort. Without it, an unexpected throw returns Express's default
  // HTML error page — including a stack trace — to the browser.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('[unhandled]', err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  return app;
}
