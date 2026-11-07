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
import { createAiLessonPlanSaveRouter } from './routes/aiLessonPlanSave.js';
import { createWeeklyWorksheetProductionSaveRouter } from './routes/weeklyWorksheetProductionSave.js';
import { createAiWeeklyWorksheetSaveRouter } from './routes/aiWeeklyWorksheetSave.js';
import { createAiWeeklyWorksheetManageRouter } from './routes/aiWeeklyWorksheetManage.js';
import { createAiWeeklyWorksheetDistributeRouter } from './routes/aiWeeklyWorksheetDistribute.js';
import weeklyWorksheetRoutes from './routes/weeklyWorksheets.js';
import { createWeeklyJobRouter } from './routes/weeklyJobs.js';
import { createDayTaskRouter } from './routes/dayTasks.js';
import { adminUsersRouter, onboardingRouter } from './routes/onboarding.js';

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

async function loadWeeklyDraftRouters(env) {
  const [{ createWeeklyDraftJobsRouter }, { createWeeklyDraftWorkerComposition }] = await Promise.all([
    import('./routes/weeklyDraftJobs.js'), import('./lib/weeklyDraftWorkerComposition.js'),
  ]);
  const worker = createWeeklyDraftWorkerComposition({ env });
  return { teacher: createWeeklyDraftJobsRouter(), worker };
}

export function createApp({ env = process.env, loadDraftRouters = loadWeeklyDraftRouters } = {}) {
  const app = express();

  app.use(cors({ origin: corsOrigin(), credentials: false }));

  // A base64 PDF is bulky; express defaults to 100kb and would reject every
  // real upload. 5mb leaves room above the route's own 3MB PDF ceiling
  // (base64 plus the envelope) while staying under the 4.5MB body cap Vercel
  // applies to serverless requests — a larger number here would just move
  // the rejection to the platform, whose error says nothing useful.
  app.use(express.json({ limit: '5mb' }));

  app.disable('x-powered-by');

  // For the host's health check, and for answering "is the API even up?"
  // without needing a login.
  //
  // Registered at both paths because the prefix differs by host. Run as a
  // process it is localhost:3001/health; on Vercel every request reaching
  // the function is rewritten under /api, so Express sees /api/health. The
  // first live check hit the second path, got this app's own 404 back, and
  // read as "the API is not deployed" when in fact it was answering.
  const health = (_req, res) => res.json({ ok: true, service: 'eduscribe-api' });
  app.get('/health', health);
  app.get('/api/health', health);

  app.use('/api/ai', aiRoutes);
  app.use('/api/lesson-plans/ai-save', createAiLessonPlanSaveRouter());
  app.use('/api/weekly-worksheets/ai-save', createAiWeeklyWorksheetSaveRouter());
  app.use('/api/weekly-worksheets/production-save', createWeeklyWorksheetProductionSaveRouter({ env }));
  app.use('/api/weekly-worksheets/manage', createAiWeeklyWorksheetManageRouter());
  app.use('/api/weekly-worksheets/distribute', createAiWeeklyWorksheetDistributeRouter());
  app.use('/api/ai', weeklyWorksheetRoutes);
  app.use('/api/ai/weekly-jobs', createWeeklyJobRouter());
  app.use('/api/ai/day-tasks', createDayTaskRouter());
  app.use('/api/admin/users', adminUsersRouter);
  app.use('/api/onboarding', onboardingRouter);

  if (env?.WEEKLY_DRAFT_GENERATION_ENABLED === 'true') {
    let initialization;
    const routers = () => initialization ??= Promise.resolve().then(() => loadDraftRouters(env)).then(result => {
      if (typeof result?.teacher !== 'function' || typeof result?.worker !== 'function')
        throw new TypeError('Weekly draft routes are unavailable.');
      return result;
    });
    const mount = route => async (req, res, next) => {
      try { (await routers())[route](req, res, next); }
      catch {
        res.set('Cache-Control', 'no-store');
        res.status(503).json({ code: 'weekly_draft_unavailable', error: 'Weekly generation is unavailable.' });
      }
    };
    app.use('/api/ai/weekly-draft-jobs', mount('teacher'));
    app.use('/api/internal/weekly-draft-worker', mount('worker'));
  }

  app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));

  // Last resort. Without it, an unexpected throw returns Express's default
  // HTML error page — including a stack trace — to the browser.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    // A body over the json limit is not an unexpected failure, it is the
    // caller sending too much — and it arrives here because express.json
    // throws before any route runs. Left to the generic branch it became
    // "Something went wrong on the server", a dead end for a teacher whose
    // only real problem was a scanned PDF.
    if (err.type === 'entity.too.large') {
      return res.status(413).json({
        error: 'That file is too large to send. Scanned documents are large '
          + 'because every page is an image — export the PDF as text, or compress it.',
      });
    }
    // Malformed JSON, same reasoning: the caller's fault, not a server fault.
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'The request body was not valid JSON.' });
    }
    console.error('[unhandled]', err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  return app;
}
