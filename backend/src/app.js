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

// localhost, 127.x, ::1, and the three private IPv4 ranges — on any port.
const PRIVATE_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

/**
 * Who may call this API.
 *
 * In production: the explicit CORS_ORIGINS list, nothing else. Left open,
 * any page on the internet could spend the school's Gemini quota using a
 * logged-in teacher's session.
 *
 * In development: that list PLUS any private-network origin. Vite binds to
 * every interface, so a developer's browser can legitimately arrive from
 * localhost, from 192.168.x.x, or from the VirtualBox adapter at
 * 192.168.56.1 — and a device joining the sixty-user test arrives from a
 * LAN address nobody could have listed in advance. A hardcoded localhost
 * list rejected the first real upload with a CORS error that named neither
 * the origin nor the fix.
 */
function corsOrigin() {
  const allowList = (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',').map(s => s.trim()).filter(Boolean);
  const isProduction = process.env.NODE_ENV === 'production';

  console.log(isProduction
    ? `CORS: production — only ${allowList.join(', ')}`
    : `CORS: development — ${allowList.join(', ')} plus any private-network origin`);

  return (origin, callback) => {
    // No Origin header: curl, a health check, a same-origin request. Not a
    // browser cross-origin call, so there is nothing for CORS to decide.
    if (!origin) return callback(null, true);
    if (allowList.includes(origin)) return callback(null, true);

    if (!isProduction) {
      try {
        if (PRIVATE_HOST.test(new URL(origin).hostname)) return callback(null, true);
      } catch {
        // An unparseable Origin is not one to trust.
      }
    }

    // Logged, because the browser's own error names the origin but the
    // server otherwise says nothing — and the server log is where someone
    // debugging this will actually look.
    console.warn(`CORS: refused ${origin}`);
    return callback(null, false);
  };
}

export function createApp() {
  const app = express();

  app.use(cors({ origin: corsOrigin(), credentials: false }));

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
