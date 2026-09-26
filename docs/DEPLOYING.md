# Deploying EduScribe to Vercel

The whole system deploys as **one Vercel project**: the React bundle as
static files, the Node API as a serverless function at `/api`.

One project, not two, for a specific reason — the frontend and the API end
up on the **same origin**, so there is no CORS. CORS is what broke the first
live upload, and same-origin removes the entire class of failure rather than
configuring around it.

## What Vercel needs

Everything is already in `vercel.json`. Nothing to configure in the
dashboard except the environment variables.

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "frontend/dist",
  "functions": { "api/index.js": { "maxDuration": 120, "includeFiles": "backend/src/lib/**" } },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index.js" },
    { "source": "/(.*)",     "destination": "/index.html" }
  ]
}
```

`includeFiles` is not optional. The ILAW prompt lives in
`backend/src/lib/ilaw-prompt.txt` and is read at runtime; without that line
the bundler leaves it out and every generation fails at import.

`maxDuration: 120` because Gemini takes 12–60 seconds on a real PDF and the
server may retry once. Hobby allows up to 300.

**Root Directory must be blank** in Project Settings → Build & Deployment.
Set to a subfolder, Vercel looks for `vercel.json` there and none of the
above applies.

## Environment variables

Set these in Project Settings → Environment Variables, for Production and
Preview.

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | the anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | the service role key |
| `GEMINI_API_KEY` | the Gemini key |
| `VITE_SUPABASE_URL` | the same URL again |
| `VITE_SUPABASE_ANON_KEY` | the same anon key again |

The `VITE_` pair is compiled into the browser bundle; the unprefixed ones
stay on the server. That duplication is the whole security boundary, so it
is deliberate rather than untidy.

**Do not set `VITE_GEMINI_API_KEY`.** That prefix is what put the key in the
browser in the first place. Anything with a `VITE_` prefix is public.

**Do not set `VITE_API_BASE_URL`.** Left unset, the app calls `/api` on its
own origin, which is what you want. Set it only if the API ever moves to a
different host.

`CORS_ORIGINS` is not needed: same-origin requests carry no `Origin` header,
so there is nothing for CORS to decide.

## Limits that shape the deployment

| | |
| --- | --- |
| Request body | **4.5 MB**, enforced by Vercel before any code runs |
| PDF size | **3 MB** — 4.5 ÷ 1.37, because base64 inflates a file by a third |
| Function duration | 120s configured, 300s allowed on Hobby |

The 3 MB ceiling is enforced in two places that must agree:
`MAX_PDF_BYTES` in `backend/src/routes/ai.js` and `MAX_PDF_MB` in
`frontend/.../LessonPlansTab.jsx`. The client check makes a large file fail
instantly instead of after a slow upload; the server check exists because
the client can be bypassed.

In practice this is not the constraint it sounds like. A syllabus or
curriculum guide exported from Word is 100 KB to 1 MB. Only **scanned**
documents are large, because every page is an image — and Gemini reads a
text PDF better anyway.

If it ever needs to be larger, the options in order of effort: raise
`MAX_PDF_BYTES` and move the API to a host with no body cap (Render,
Railway, Fly); or have the browser upload to Supabase Storage and send the
API only the path. The second keeps everything on Vercel.

## What degrades under serverless

Stated rather than discovered later.

The rate limiter (20 generations per teacher per hour) keeps its counts in
memory, and each cold invocation starts with an empty one. It still stops a
runaway loop inside a warm instance, which is what it was written for, but
it is not the hard ceiling it is on a long-running process. Making it one
needs shared storage.

## Verifying a deployment

```
https://<your-app>.vercel.app/api/health
```

Expect `{"ok":true,"service":"eduscribe-api"}`. If that fails, the function
did not build — check the deployment logs before anything else.

Then log in as a teacher and generate a lesson plan from a small PDF. The
function's log in the Vercel dashboard prints one line per generation:

```
[ai] lesson plan for teacher@dpnhs.edu.ph (syllabus.pdf) in 14.2s
```

## Running locally

Unchanged — two processes rather than one:

```bash
npm start -w backend    # API on :3001
npm run dev             # frontend on :5173
```

In development the frontend calls `http://<the page's host>:3001`, and CORS
accepts any private-network origin so it works from a phone or a second
laptop on the same network. In production both of those paths are off:
same-origin, and the strict allowlist.
