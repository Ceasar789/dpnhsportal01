// ============================================
// FILE: api/index.js
// The Vercel entry point for the backend.
//
// Vercel turns every file under api/ into a serverless function, so this one
// exports the same Express app that `npm start -w backend` runs locally.
// One app, two ways of being hosted — there is no second copy of the routing
// to keep in step.
//
// The whole system deploys as ONE Vercel project: the React bundle as static
// files, this as /api/*. Same origin, which means no CORS at all — and CORS
// is precisely what broke the first live upload.
//
// What changes under serverless, stated plainly:
//
//   Request body is capped at 4.5MB by the platform, before this code runs.
//   That is why the PDF limit is 3MB here and 20MB on a long-running host —
//   base64 inflates a file by about a third.
//
//   The rate limiter keeps its counts in memory, and each cold invocation
//   starts with an empty one. It still catches a runaway loop inside a warm
//   instance, which is the case it was written for, but it is not the hard
//   per-teacher ceiling it is on a single long-running process. Making it
//   one would need shared storage; noted rather than pretended otherwise.
// ============================================

import { createApp } from '../backend/src/app.js';

export default createApp();
