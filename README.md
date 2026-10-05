# Personal Cash Flow Tracker (PWA)

A mobile-first Progressive Web App for tracking personal cash flow:

> Know exactly how much money came in, how much was spent, and how much money should currently remain.

**Core formula:**

```text
Current Balance = Opening Balance + Total Income - Total Expenses
```

**Stack:** HTML5 + CSS3 + Vanilla JS (frontend) · Node.js + Express (backend) · MongoDB + Mongoose (database) · JWT (auth, later phase)

**Current status: ALL PHASES COMPLETE (1–17).** The Personal Cash Flow Tracker MVP is production ready. All 17 phases from the PRD are fully implemented with 136 passing automated tests across 38 suites. Production Docker, Docker Compose, Nginx, and PM2 deployment configurations are available in [DEPLOYMENT.md](file:///d:/AMTechSolutions/PAW/PAW/DEPLOYMENT.md).

## API so far

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | — | Liveness + DB status |
| POST | `/api/auth/register` | Rate limited | Create account (also seeds settings + default categories); sets `token` cookie |
| POST | `/api/auth/login` | Rate limited | Login; sets `token` cookie |
| POST | `/api/auth/logout` | — | Clears the auth cookie |
| GET | `/api/auth/me` | cookie or `Authorization: Bearer` | Current user |
| GET/POST | `/api/transactions` | ✅ | List (search/filter/paginate) / create |
| GET/PUT/DELETE | `/api/transactions/:id` | ✅ | Read / edit / delete a transaction |
| GET | `/api/dashboard` | ✅ | Balance summary + recent transactions |
| GET/POST | `/api/categories` | ✅ | List / create categories |
| PUT/DELETE | `/api/categories/:id` | ✅ | Rename/disable / delete (409 if in use) |
| GET | `/api/reports/monthly\|categories\|income-expense\|custom` | ✅ | Reports (timezone-aware, PRD §52) |
| GET/PUT | `/api/settings` | ✅ | Display preferences |
| PUT | `/api/settings/opening-balance` | ✅ | Set opening balance + date |
| GET | `/api/export/csv` | ✅ | Export all transactions in RFC 4180 CSV |
| GET | `/api/export/json` | ✅ | Full JSON backup of settings, categories, transactions |
| POST | `/api/import/json` | ✅ | Validated JSON backup or transactions import |


## Project structure

```text
personal-finance-tracker/
├── client/              # PWA frontend (HTML/CSS/vanilla JS)
│   ├── index.html       # Landing page + server status
│   ├── login.html       # Auth forms wired in Phase 8
│   ├── register.html
│   ├── dashboard.html   # Data wired in Phase 9
│   ├── transactions.html
│   ├── reports.html
│   ├── settings.html
│   ├── manifest.json    # PWA manifest (PRD section 40)
│   ├── sw.js            # Service worker: static-only offline cache
│   ├── icons/           # 192/512, maskable, apple-touch, favicon
│   ├── css/style.css    # Shared mobile-first styles
│   └── js/
│       ├── api.js       # Fetch wrapper
│       ├── auth.js      # Session guard + login/register/logout
│       ├── format.js    # Money/date formatting (৳)
│       ├── pwa.js       # SW registration + offline banner
│       ├── transactionModal.js  # Add/edit/delete bottom sheet
│       ├── dashboard.js # Phase 9
│       ├── transactions.js      # Phase 11
│       ├── categories.js        # Phase 12 (settings page)
│       ├── settings.js  # Phase 12 (account/balance/prefs)
│       ├── reports.js   # Phase 13
│       └── app.js       # Landing status check
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

1. ✅ **Project setup**
2. ✅ Database models (User, Transaction, Category, Settings)
3. ✅ Authentication (bcrypt + JWT + secure cookies)
4. ✅ Transaction CRUD API
5. ✅ Balance service
6. ✅ Dashboard API
7. ✅ Frontend foundation (7 pages, mobile-first CSS)
8. ✅ Authentication UI (login/register/logout/session guard)
9. ✅ Dashboard UI (balance/income/expense/net/recent)
10. ✅ Add income/expense modal (bottom sheet, edit + delete confirm)
11. ✅ Transactions page (search, filters, pagination, edit, delete)
12. ✅ Categories (API + settings UI, safe delete → disable)
13. ✅ Reports (monthly, categories, income vs expense, custom range)
14. ✅ PWA (manifest, service worker, icons, offline static cache)
15. ✅ Export / import (CSV + JSON export, validated JSON import)
16. ✅ Security review & hardening (rate limiting, NoSQL sanitization, CSP, cookies)
17. ✅ Production deployment (Dockerfile, Compose, Nginx, PM2, and [DEPLOYMENT.md](file:///d:/AMTechSolutions/PAW/PAW/DEPLOYMENT.md))


