# EduScribe

An AI-assisted, web-based lesson planning and learning resources management
system for Dela Paz National High School.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite 5, React Router, Tailwind |
| Backend | Node.js, PostgreSQL schema and Row Level Security |
| Database | Supabase — PostgreSQL, Auth, Storage |
| AI | Google Gemini |

## Layout

An npm workspaces monorepo.

```
eduscribe/
├── frontend/          React application
│   ├── src/
│   ├── public/
│   └── vite.config.js
├── backend/           Data model, authorization, operations
│   ├── database/      Schema, migrations, seeds, RLS tests
│   ├── scripts/       Backups, provisioning, diagnostics
│   └── README.md      What the backend is and why it is shaped this way
├── e2e/               Playwright end-to-end tests
├── docs/              Specs, plans, handoff notes, test case documentation
└── tools/             Build tooling that belongs to neither side
```

## Getting started

```bash
npm install                 # installs both workspaces
cp frontend/.env.example frontend/.env    # then fill in the values
npm run dev                 # http://localhost:5173
```

`frontend/.env` needs:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_API_BASE_URL=http://localhost:3001
```

All three are public by design. The anon key is meant to reach the browser —
Row Level Security is what protects the data behind it — and the API base is
a URL.

The secrets live in `backend/.env` (`cp backend/.env.example backend/.env`):
the Gemini key and the Supabase service role. Neither can be protected in a
browser, which is why the Node service exists.

## Scripts

```bash
npm run dev              # frontend dev server
npm start -w backend     # API on :3001 — needed for AI lesson plans
npm run build            # production build → frontend/dist
npm test                 # 117 unit, render and component tests
npm run test:e2e         # Playwright (needs `npx playwright install chromium`)
npm run docs:testcases   # regenerate the test case PDF
```

Database migrations are run by hand in the Supabase SQL Editor, in filename
order. See `backend/database/`.

## Testing

Four layers, each catching what the others structurally cannot.

| Layer | Where | Count |
| --- | --- | --- |
| Unit and render | `frontend/src/**/*.test.js(x)` | 94 |
| Component interaction | `frontend/src/pages/**/*.test.jsx` | 23 |
| Row Level Security | `backend/database/tests/` | 13 |
| End-to-end | `e2e/` | 15 |
| Manual | `docs/SmartEdu-Portal-Test-Cases.pdf` | 20 |

The RLS and end-to-end suites are read-only: there is no separate test
database, so they run against the live one. Nothing in them creates, edits
or deletes a row.

Full test case documentation, including what the suites deliberately do not
cover, is in [docs/SmartEdu-Portal-Test-Cases.pdf](docs/SmartEdu-Portal-Test-Cases.pdf).

## Deployment

One Vercel project: the React bundle as static files, the Node API as a
serverless function at `/api`. Same origin, so there is no CORS.

See [docs/DEPLOYING.md](docs/DEPLOYING.md) for the environment variables and
the limits that shape it — in particular the 3MB PDF ceiling, which comes
from Vercel capping a serverless request body at 4.5MB.
