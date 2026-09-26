# EduScribe — Backend

The data model, the authorization rules, and the operations that need a
credential the browser must never hold.

## Layout

```
backend/
├── database/
│   ├── schema/        The full table definitions, and storage bucket setup
│   ├── migrations/    Versioned, ordered changes — phase1 … phase4-02
│   ├── seeds/         The throwaway test population (60 students, 48 teachers)
│   ├── tests/         The Row Level Security test suite
│   └── legacy/        One-off fixes from before the phased migrations began
└── scripts/           Operational Node scripts: backups, provisioning, diagnostics
```

Every file under `database/` is run by hand in the Supabase SQL Editor, in
the order its filename gives. There is no migration runner — with one
developer and a single environment, a runner would be machinery guarding
against a problem that does not exist here.

## What the backend actually is

| | |
| --- | --- |
| Tables | 34 |
| Row Level Security policies | 41 |
| `SECURITY DEFINER` functions | 21 |
| Triggers | 27 |
| CHECK constraints | 86 |
| Foreign keys with cascade rules | 96 |
| Indexes | 125 |
| Migrations | 16 |

## Why authorization lives in the database

There is no application server between the browser and the data: the client
calls Supabase's auto-generated REST API directly. That makes Row Level
Security the authorization layer, not a second line of defence behind one.

This is a deliberate choice, and the reason is that the rule is enforced
*per query*, by the database, whoever is asking. A student cannot read
another student's answers by calling the API directly, by crafting their own
request, or by any route that bypasses the application — because the
restriction is not in the application.

The same rules expressed as `if` statements in an Express route would hold
only for requests that went through that route, and only until somebody
forgot one. There are 41 of them.

`database/tests/phase5-01-rls-tests.sql` proves it: thirteen checks that run
as real logged-in users by setting `request.jwt.claims`, so the database
answers exactly as it would for that person.

## The Node service

```
src/
├── server.js              entry — refuses to start with a variable missing
├── app.js                 CORS, JSON limits, health, error handler
├── routes/ai.js           POST /api/ai/lesson-plan
├── middleware/
│   └── requireAuth.js     verifies the caller's Supabase session
└── lib/
    ├── gemini.js          the Gemini call, timeout and one retry
    ├── ilawPrompt.js      loads the prompt
    └── ilaw-prompt.txt    the DepEd ILAW format, 9,192 characters
```

```bash
npm start -w backend       # http://localhost:3001
npm run dev -w backend     # with --watch
```

### What it does, and what it refuses to do

**`POST /api/ai/lesson-plan`** takes a base64 PDF and returns an ILAW lesson
plan as HTML. The Gemini key is read here and never leaves the process. The
caller must present a valid Supabase session belonging to a teacher or an
admin, and is limited to twenty generations an hour — keyed by user, not by
IP, because a whole school behind one router shares an address and an
IP-keyed limit would have one teacher lock out everyone else.

The key was previously read in the browser from `VITE_GEMINI_API_KEY`. Vite
inlines every `VITE_*` variable into the shipped bundle, so it was readable
by anyone who opened the teacher dashboard, and it is billable. The frontend
now holds only `VITE_API_BASE_URL` — a URL, worthless to anyone who finds it.

The ILAW prompt moved with it, because the prompt *is* business logic: the
framework, the letterhead, the five-day structure and the exact HTML class
names the renderer depends on.

Sessions are verified by asking Supabase rather than by decoding the JWT
locally. Anyone can read a JWT; only the issuer can say whether it is still
valid, and a locally-decoded token keeps working after an account is
suspended.

### Still to move

**User provisioning.** The admin screen calls `signUp()` and then restores
its own session, and never creates the `students` row a learner needs before
they can be enrolled anywhere. `auth.admin.createUser` with the service role
does it properly, and the service role cannot live in a browser.

### The boundary

Both jobs hold a secret. That is the whole rule: **the backend owns the
credentials the browser must never see.** Everything else stays where the
database can enforce it.

## Scripts

```bash
npm run backup:history -w backend    # snapshot history for the admin dashboard
npm run backup:storage -w backend    # pull the storage buckets
npm run db:setup       -w backend    # first-time schema provisioning
```

`scripts/` also holds one-off diagnostics (`diagnose-login-issue.js`,
`verify-user-role.mjs`) kept because they have each been needed twice.

Every script reads its credentials from the environment. None of them
carries a key, and none should ever be given one.
