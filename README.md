# Personal Cash Flow Tracker (PWA)

A mobile-first Progressive Web App for tracking personal cash flow:

> Know exactly how much money came in, how much was spent, and how much money should currently remain.

**Core formula:**

```text
Current Balance = Opening Balance + Total Income - Total Expenses
```

**Stack:** HTML5 + CSS3 + Vanilla JS (frontend) · Node.js + Express (backend) · MongoDB + Mongoose (database) · JWT (auth, later phase)

**Current status: PHASE 3 — Authentication.** Models, indexes, and default-category seeding (Phase 2) plus register/login/logout/`/me` with bcrypt + JWT in HTTP-only cookies (Phase 3) are implemented. Transactions API and UI are next (Phases 4+).

## API so far

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | — | Liveness + DB status |
| POST | `/api/auth/register` | — | Create account (also seeds settings + default categories); sets `token` cookie |
| POST | `/api/auth/login` | — | Login; sets `token` cookie |
| POST | `/api/auth/logout` | — | Clears the auth cookie |
| GET | `/api/auth/me` | cookie or `Authorization: Bearer` | Current user |

## Project structure

```text
personal-finance-tracker/
├── client/              # PWA frontend (HTML/CSS/vanilla JS)
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── server/
│   ├── src/
│   │   ├── config/database.js
│   │   ├── middleware/errorHandler.js
│   │   ├── routes/healthRoutes.js
│   │   └── app.js
│   ├── tests/health.test.js
│   ├── server.js
│   └── package.json
├── .env.example
├── .gitignore
└── package.json         # Root: delegates scripts to server/
```

## Prerequisites

- Node.js 18+ (developed on Node 24)
- MongoDB 6+ running locally, or a `MONGODB_URI` pointing at any MongoDB instance

## Setup

```bash
# 1. Install server dependencies
npm install            # or: npm install --prefix server

# 2. Create your local env file (never commit .env)
cp .env.example .env   # then edit values as needed
```

## Environment variables

Copy `.env.example` to `.env` and adjust:

| Variable       | Dev default                                   | Notes                              |
| -------------- | --------------------------------------------- | ---------------------------------- |
| `NODE_ENV`     | `development`                                 | `production` enables strict CORS   |
| `PORT`         | `5000`                                        | API + static frontend port         |
| `MONGODB_URI`  | `mongodb://localhost:27017/personal_finance`  | Never commit real credentials      |
| `JWT_SECRET`   | `CHANGE_THIS_SECRET`                          | Used from Phase 3 (auth) onward    |
| `FRONTEND_URL` | `http://localhost:3000`                       | CORS allow-list for production     |
| `COOKIE_SECURE`| `false`                                       | `true` behind HTTPS in production  |

## Run

```bash
npm run dev     # development (node --watch)
npm start       # production-style start
npm test        # smoke tests (no MongoDB required)
```

Then open **http://localhost:5000** — the Express server serves the frontend and API on the same port.

## Health check

```bash
curl http://localhost:5000/api/health
```

```json
{ "status": "ok", "db": "connected", "uptime": 12.34, "timestamp": "..." }
```

`db` is `disconnected` until MongoDB is reachable; the server stays up and reports it rather than crashing.

## Notes

- MongoDB not installed locally? The server still boots and `/api/health` reports `db: "disconnected"`. Phase 2 (models + connection verification) will require a real MongoDB instance — e.g. `docker run -d -p 27017:27017 mongo:7`.
- Frontend is intentionally framework-free vanilla JS per the PRD (no React/Vue/Next/Angular/TypeScript).

## Roadmap (PRD phases)

1. ✅ **Project setup** (this phase)
2. Database models (User, Transaction, Category, Settings)
3. Authentication (bcrypt + JWT + secure cookies)
4. Transaction CRUD API
5. Balance service
6. Dashboard API
7–11. Frontend (auth UI, dashboard, add/edit transactions, list)
12–13. Categories, Reports
14–15. PWA + export/import
16–17. Security review, deployment
