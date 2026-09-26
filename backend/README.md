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

Not yet built. It has exactly two jobs, and they are the same job:

1. **AI generation** — the Gemini API key. `VITE_GEMINI_API_KEY` currently
   ships inside the client bundle, because Vite inlines every `VITE_*`
   variable at build time. An API key cannot be protected in a browser.
2. **User provisioning** — the Supabase `service_role` key, for
   `auth.admin.createUser`. The admin screen currently calls `signUp()` and
   then restores its own session, which also fails to create the `students`
   row a learner needs before they can be enrolled anywhere.

Both hold a secret. That is the entire boundary: **the backend owns the
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
