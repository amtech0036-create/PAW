# Personal Cash Flow Tracker PWA
## Product Requirements Document (PRD)

**Version:** 1.0  
**Status:** Development Ready  
**Platform:** Mobile-first Progressive Web App (PWA)  
**Primary Device:** iPhone / Mobile Safari  
**Frontend:** HTML5 + CSS3 + Vanilla JavaScript  
**Backend:** Node.js + Express.js  
**Database:** MongoDB  
**Authentication:** JWT  
**Deployment:** VPS / Docker-compatible  
**Primary User:** Single personal user initially

---

# 1. Product Overview

## 1.1 Product Name

Working name:

**Personal Cash Flow Tracker**

The name can be changed later.

## 1.2 Purpose

The application will allow the user to track:

- Opening balance
- Fixed salary
- Random/extra income
- Freelance income
- Business income
- Daily expenses
- Expense categories
- Current available balance
- Monthly income
- Monthly expenses
- Net cash flow
- Historical transactions
- Financial reports

The application is NOT intended to initially be a full accounting/ERP system.

The main objective is:

> Know exactly how much money came in, how much was spent, and how much money should currently remain.

---

# 2. Core Financial Formula

The application must use a simple ledger calculation.

```text
Current Balance
=
Opening Balance
+
Total Income
-
Total Expenses
```

Example:

```text
Opening Balance = ৳30,000

Salary          = +৳25,000
Freelance       = +৳8,000
Other Income    = +৳2,000

Food            = -৳4,000
Transport       = -৳2,000
Shopping        = -৳3,000

Current Balance = ৳56,000
```

The system must never treat monthly salary as the only source of income.

Every income event is an independent transaction.

---

# 3. Main Product Principles

## 3.1 Simple

The user should be able to record an expense in approximately 5–10 seconds.

## 3.2 Mobile First

The primary interface must be designed for an iPhone.

Desktop support is secondary.

## 3.3 Fast

Adding an expense should require minimal navigation.

## 3.4 Accurate

Every balance must be calculated from transactions.

## 3.5 Transparent

The user must be able to see exactly why the current balance has its current value.

## 3.6 Expandable

The architecture should allow future features without rebuilding the entire application.

---

# 4. MVP Scope

## Required MVP Features

### Dashboard

- Current balance
- Total income
- Total expenses
- Net cash flow
- Current month summary
- Recent transactions
- Quick Add Income
- Quick Add Expense

### Income

- Add income
- Edit income
- Delete income
- Income category
- Income source
- Date
- Amount
- Note

### Expenses

- Add expense
- Edit expense
- Delete expense
- Expense category
- Date
- Amount
- Note

### Opening Balance

- Set opening balance
- Set opening balance date
- Edit opening balance

### Transactions

- View all transactions
- Search
- Filter by date
- Filter by type
- Filter by category

### Reports

- Monthly income
- Monthly expenses
- Net cash flow
- Income vs expense
- Category-wise expenses
- Historical monthly summary

### Data

- CSV export
- JSON backup
- JSON restore

### PWA

- Install to iPhone Home Screen
- App icon
- Splash screen
- Responsive layout
- Offline-friendly static interface

---

# 5. Future Features

These should NOT be implemented in MVP unless specifically required.

Possible future features:

- Multiple accounts
- Cash / Bank / bKash / Nagad tracking
- Recurring income
- Recurring expenses
- Budget limits
- Savings goals
- Debt tracking
- Loan tracking
- Credit card tracking
- Attach receipts
- Cloud backup
- Multiple users
- Family account
- Business/personal separation
- A&M Tech Solutions account
- Expense reminders
- Push notifications
- Advanced financial analytics
- AI financial assistant

---

# 6. User Workflow

## First-Time Setup

User opens application.

### Step 1

Create account.

### Step 2

Set:

```text
Name
Currency
Timezone
```

Default:

```text
Currency = BDT
Timezone = Asia/Dhaka
```

### Step 3

Set opening balance.

Example:

```text
Opening Balance: ৳30,000

Balance Date:
01 October 2026
```

### Step 4

Dashboard appears.

---

# 7. Income Workflow

User taps:

```text
+ Income
```

Form:

```text
Amount
Income Category
Source
Date
Note
```

Example:

```text
Amount:
৳25,000

Category:
Salary

Source:
Monthly Salary

Date:
01/10/2026

Note:
October salary
```

Save.

System creates income transaction.

Balance increases immediately.

---

# 8. Expense Workflow

User taps:

```text
- Expense
```

Form:

```text
Amount
Category
Date
Note
```

Example:

```text
Amount:
৳500

Category:
Food

Date:
04/10/2026

Note:
Lunch
```

Save.

System creates expense transaction.

Balance decreases immediately.

---

# 9. Transaction Model

Every financial movement should be stored as a transaction.

Example:

```json
{
  "type": "income",
  "amount": 25000,
  "category": "Salary",
  "date": "2026-10-01",
  "note": "October salary"
}
```

Expense:

```json
{
  "type": "expense",
  "amount": 500,
  "category": "Food",
  "date": "2026-10-04",
  "note": "Lunch"
}
```

---

# 10. Database Architecture

MongoDB should be used.

Recommended database:

```text
personal_finance
```

Collections:

```text
users
transactions
categories
settings
```

---

# 11. Users Collection

```javascript
{
  _id: ObjectId,

  name: String,

  email: String,

  passwordHash: String,

  currency: {
    type: String,
    default: "BDT"
  },

  timezone: {
    type: String,
    default: "Asia/Dhaka"
  },

  createdAt: Date,

  updatedAt: Date
}
```

Indexes:

```text
email: unique
```

---

# 12. Transactions Collection

This is the most important collection.

```javascript
{
  _id: ObjectId,

  userId: ObjectId,

  type: {
    type: String,
    enum: ["income", "expense"]
  },

  amount: Number,

  categoryId: ObjectId,

  source: String,

  date: Date,

  note: String,

  createdAt: Date,

  updatedAt: Date
}
```

## Important Rule

Amounts must always be stored as positive numbers.

Do NOT store:

```text
expense = -500
```

Instead:

```text
type = "expense"
amount = 500
```

The application determines whether to add or subtract based on `type`.

This prevents many accounting errors.

---

# 13. Opening Balance

Opening balance can be represented as a special transaction.

Recommended approach:

```javascript
{
  type: "income",
  amount: 30000,
  category: "Opening Balance"
}
```

However, to maintain better financial semantics, MVP can also use a dedicated setting.

Recommended structure:

```javascript
{
  userId: ObjectId,

  openingBalance: 30000,

  openingBalanceDate: Date,

  createdAt: Date,

  updatedAt: Date
}
```

Only one active opening balance should exist per user.

---

# 14. Categories Collection

```javascript
{
  _id: ObjectId,

  userId: ObjectId,

  name: String,

  type: {
    type: String,
    enum: ["income", "expense"]
  },

  icon: String,

  isDefault: Boolean,

  isActive: Boolean,

  createdAt: Date,

  updatedAt: Date
}
```

---

# 15. Default Income Categories

Initial categories:

```text
Salary
Freelance
Business
A&M Tech Solutions
Bonus
Commission
Investment
Gift
Other Income
```

The user can create additional categories.

---

# 16. Default Expense Categories

Initial categories:

```text
Food
Transport
Shopping
Bills
Mobile
Internet
Rent
Family
Health
Entertainment
Education
Business
Travel
Personal
Other
```

The user can add/edit categories.

---

# 17. Settings Collection

```javascript
{
  userId: ObjectId,

  currency: "BDT",

  currencySymbol: "৳",

  timezone: "Asia/Dhaka",

  theme: "system",

  language: "en",

  dateFormat: "DD/MM/YYYY",

  createdAt: Date,

  updatedAt: Date
}
```

---

# 18. Balance Calculation

The backend must calculate:

```text
Total Income
=
SUM(all income transactions)
```

```text
Total Expense
=
SUM(all expense transactions)
```

```text
Current Balance
=
Opening Balance
+
Total Income
-
Total Expense
```

The frontend must NOT be the source of truth for financial calculations.

The backend should calculate financial totals.

---

# 19. Dashboard

## Desktop

Dashboard can use a grid.

## Mobile

Dashboard should be vertically stacked.

### Top Card

```text
CURRENT BALANCE

৳62,200
```

### Second Section

```text
Income          Expenses

৳33,000          ৳8,800
```

### Third Section

```text
Net Cash Flow

+৳24,200
```

### Quick Actions

```text
[ + Income ]

[ - Expense ]
```

### Recent Transactions

```text
Today

Food
-৳450

A&M Project
+৳12,000

Transport
-৳100
```

---

# 20. Mobile Navigation

Bottom navigation:

```text
┌──────────────────────────────────┐
│                                  │
│   Home   Transactions   Reports  │
│                                  │
│          + Add                    │
│                                  │
│   Settings                        │
│                                  │
└──────────────────────────────────┘
```

Recommended:

```text
Home
Transactions
+ Add
Reports
Settings
```

The center Add button should be visually prominent.

Pressing Add opens:

```text
Add Income
Add Expense
```

---

# 21. Add Transaction UI

Use a mobile bottom sheet/modal.

Example:

```text
Add Expense

Amount
┌────────────────────┐
│ ৳ 500              │
└────────────────────┘

Category
┌────────────────────┐
│ Food           ▼   │
└────────────────────┘

Date
┌────────────────────┐
│ 04/10/2026         │
└────────────────────┘

Note
┌────────────────────┐
│ Lunch              │
└────────────────────┘

[ Save Expense ]
```

Amount input should automatically focus when possible.

---

# 22. Transactions Page

Display transactions grouped by date.

Example:

```text
TODAY

Food                     -৳500
Transport                -৳100

YESTERDAY

A&M Project             +৳8,000
Shopping                -৳1,200

02 OCT

Salary                 +৳25,000
```

Each transaction should show:

```text
Icon
Category
Note
Date
Amount
```

Income:

```text
+৳25,000
```

Expense:

```text
-৳500
```

---

# 23. Transaction Details

When user taps a transaction:

```text
Transaction

Food

-৳500

04 October 2026

Category
Food

Note
Lunch

Created
04 October 2026

[ Edit ]

[ Delete ]
```

Delete must require confirmation.

---

# 24. Search & Filters

Transactions page should support:

### Search

Search:

```text
food
salary
A&M
transport
```

### Type Filter

```text
All
Income
Expense
```

### Date Filter

```text
Today
This Week
This Month
Last Month
Custom Range
```

### Category Filter

```text
Food
Transport
Salary
Business
...
```

---

# 25. Reports Page

Reports should initially focus on practical information.

## Monthly Overview

Example:

```text
October 2026

Income
৳45,000

Expenses
৳18,500

Net
+৳26,500
```

---

# 26. Income vs Expense Chart

Display a simple bar/column chart.

Example:

```text
Income    ███████████████
Expense   ██████
```

Monthly comparison:

```text
May
Income     ৳35k
Expense    ৳20k

June
Income     ৳42k
Expense    ৳25k

July
Income     ৳38k
Expense    ৳22k
```

Chart library can be added later if necessary.

Avoid unnecessary heavy libraries in MVP.

---

# 27. Expense Category Report

Example:

```text
Food              ৳5,000   30%
Transport         ৳2,500   15%
Shopping          ৳4,000   24%
Bills             ৳3,000   18%
Other             ৳2,000   13%
```

This lets the user understand where money is going.

---

# 28. Monthly History

Display:

```text
October 2026

Income       ৳45,000
Expenses     ৳18,500
Net          +৳26,500


September 2026

Income       ৳40,000
Expenses     ৳21,000
Net          +৳19,000
```

---

# 29. Settings Page

Sections:

## Account

```text
Name
Email
Change Password
```

## Financial

```text
Currency
Opening Balance
Opening Balance Date
```

## Categories

```text
Income Categories
Expense Categories
```

## App

```text
Theme
Language
Date Format
```

## Data

```text
Export CSV
Export JSON
Import JSON
```

## Security

```text
Logout
```

---

# 30. Authentication

MVP should use:

```text
Email
Password
```

Authentication flow:

```text
Register
   ↓
Login
   ↓
JWT
   ↓
Dashboard
```

Use:

```text
bcrypt
```

for password hashing.

JWT should be implemented securely.

Prefer HTTP-only secure cookies for browser authentication rather than storing long-lived JWTs in localStorage.

---

# 31. Backend Architecture

Recommended:

```text
Node.js
Express.js
MongoDB
Mongoose
JWT
bcrypt
dotenv
cors
helmet
```

Optional:

```text
express-rate-limit
compression
morgan
```

---

# 32. Project Structure

Recommended structure:

```text
personal-finance-tracker/

├── client/
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── dashboard.html
│   ├── transactions.html
│   ├── reports.html
│   ├── settings.html
│   │
│   ├── css/
│   │   ├── style.css
│   │   ├── responsive.css
│   │   └── components.css
│   │
│   ├── js/
│   │   ├── api.js
│   │   ├── auth.js
│   │   ├── dashboard.js
│   │   ├── transactions.js
│   │   ├── reports.js
│   │   ├── settings.js
│   │   ├── components.js
│   │   └── utils.js
│   │
│   ├── assets/
│   │
│   ├── manifest.json
│   └── sw.js
│
├── server/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js
│   │   │
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   ├── Transaction.js
│   │   │   ├── Category.js
│   │   │   └── Settings.js
│   │   │
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── transactionController.js
│   │   │   ├── categoryController.js
│   │   │   ├── reportController.js
│   │   │   └── settingsController.js
│   │   │
│   │   ├── routes/
│   │   │   ├── authRoutes.js
│   │   │   ├── transactionRoutes.js
│   │   │   ├── categoryRoutes.js
│   │   │   ├── reportRoutes.js
│   │   │   └── settingsRoutes.js
│   │   │
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   ├── errorHandler.js
│   │   │   └── validation.js
│   │   │
│   │   ├── services/
│   │   │   ├── balanceService.js
│   │   │   ├── reportService.js
│   │   │   └── exportService.js
│   │   │
│   │   └── app.js
│   │
│   ├── server.js
│   └── package.json
│
├── .env
├── .env.example
├── .gitignore
├── README.md
└── package.json
```

---

# 33. API Design

Base URL:

```text
/api
```

---

## Authentication

### Register

```http
POST /api/auth/register
```

Request:

```json
{
  "name": "Anim",
  "email": "user@example.com",
  "password": "********"
}
```

### Login

```http
POST /api/auth/login
```

### Logout

```http
POST /api/auth/logout
```

### Current User

```http
GET /api/auth/me
```

---

# 34. Transaction APIs

### Get Transactions

```http
GET /api/transactions
```

Query examples:

```text
?page=1
&limit=20
&type=expense
&category=food
&startDate=2026-10-01
&endDate=2026-10-31
```

### Create Transaction

```http
POST /api/transactions
```

### Get Single Transaction

```http
GET /api/transactions/:id
```

### Update

```http
PUT /api/transactions/:id
```

### Delete

```http
DELETE /api/transactions/:id
```

---

# 35. Dashboard API

```http
GET /api/dashboard
```

Response:

```json
{
  "openingBalance": 30000,
  "totalIncome": 45000,
  "totalExpense": 18500,
  "currentBalance": 56500,
  "netCashFlow": 26500,
  "recentTransactions": []
}
```

---

# 36. Reports APIs

### Monthly Summary

```http
GET /api/reports/monthly
```

### Category Summary

```http
GET /api/reports/categories
```

### Income vs Expense

```http
GET /api/reports/income-expense
```

### Custom Date Range

```http
GET /api/reports/custom
```

---

# 37. Category APIs

```http
GET    /api/categories
POST   /api/categories
PUT    /api/categories/:id
DELETE /api/categories/:id
```

---

# 38. Settings APIs

```http
GET /api/settings
PUT /api/settings
```

Opening balance:

```http
PUT /api/settings/opening-balance
```

---

# 39. Export APIs

```http
GET /api/export/csv
GET /api/export/json
```

Import:

```http
POST /api/import/json
```

Imported data must be validated before insertion.

---

# 40. PWA Requirements

The application must include:

```text
manifest.json
service-worker.js
icons
offline cache
```

Manifest:

```json
{
  "name": "Personal Cash Flow Tracker",
  "short_name": "CashFlow",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#ffffff",
  "background_color": "#ffffff"
}
```

The app should be installable using:

```text
Safari → Share → Add to Home Screen
```

---

# 41. Offline Strategy

MVP:

Static frontend assets should be cached.

However:

**Do NOT silently save financial transactions offline and pretend they were synchronized.**

For MVP, if there is no internet:

```text
Show:
"You are offline. Connect to the internet to save transactions."
```

Future version can implement IndexedDB offline transactions + synchronization.

---

# 42. Currency

Primary currency:

```text
BDT
```

Display:

```text
৳25,000
```

Do not use floating-point arithmetic for money where avoidable.

For MongoDB storage, consider storing the smallest currency unit.

For BDT:

```text
৳500.00
```

could be stored as:

```text
50000
```

if using paisa-based integer storage.

For a simple MVP where decimal amounts are not important, integer BDT amounts are acceptable.

---

# 43. Validation

## Amount

Must:

```text
> 0
```

Cannot be:

```text
negative
NaN
empty
```

## Date

Must be valid.

## Category

Must exist and belong to the current user.

## Transaction

Must belong to authenticated user.

A user must NEVER be able to access another user's transactions by changing an ID in the URL.

---

# 44. Security Requirements

Use:

```text
Helmet
Rate limiting
Password hashing
Input validation
MongoDB sanitization
Secure cookies
HTTPS
Environment variables
```

Never expose:

```text
MONGODB_URI
JWT_SECRET
Database credentials
API secrets
```

Never commit `.env`.

`.gitignore`:

```text
.env
node_modules/
logs/
```

---

# 45. Environment Variables

`.env.example`

```env
NODE_ENV=development

PORT=5000

MONGODB_URI=mongodb://localhost:27017/personal_finance

JWT_SECRET=CHANGE_THIS_SECRET

FRONTEND_URL=http://localhost:3000

COOKIE_SECURE=false
```

Production:

```env
NODE_ENV=production

PORT=5000

MONGODB_URI=YOUR_MONGODB_CONNECTION

JWT_SECRET=YOUR_LONG_RANDOM_SECRET

FRONTEND_URL=https://yourdomain.com

COOKIE_SECURE=true
```

---

# 46. UX Rules

## Amount Input

When entering:

```text
500
```

show:

```text
৳500
```

## Income

Use positive visual treatment.

## Expense

Use negative visual treatment.

## Current Balance

Should always be highly visible.

## Destructive Actions

Delete requires confirmation:

```text
Delete this transaction?

This action cannot be undone.

[Cancel] [Delete]
```

---

# 47. Empty States

Dashboard with no transactions:

```text
Welcome!

Start by adding your opening balance.

[Set Opening Balance]
```

No transactions:

```text
No transactions yet.

[Add Income]
[Add Expense]
```

No report data:

```text
No financial activity for this period.
```

---

# 48. Error Handling

Examples:

```text
Unable to load dashboard.
Please check your internet connection.
```

For server error:

```text
Something went wrong.
Please try again.
```

For validation:

```text
Please enter a valid amount.
```

Never expose raw backend stack traces to users.

---

# 49. Loading States

Use skeletons/spinners.

Dashboard:

```text
Balance
████████████

Income
████████

Expenses
████████
```

Buttons should prevent duplicate submissions while saving.

---

# 50. Database Indexes

Transactions should have indexes:

```javascript
{
  userId: 1,
  date: -1
}
```

Additional:

```javascript
{
  userId: 1,
  type: 1,
  date: -1
}
```

Categories:

```javascript
{
  userId: 1,
  type: 1
}
```

Users:

```javascript
{
  email: 1
}
```

unique.

---

# 51. Reporting Logic

## Monthly Income

Filter:

```text
userId
type = income
date >= first day of month
date < first day of next month
```

Sum amount.

## Monthly Expense

Same process:

```text
type = expense
```

## Net

```text
Income - Expense
```

## Current Balance

```text
Opening Balance
+
All Income
-
All Expenses
```

---

# 52. Important Date Rule

The system must store dates consistently.

Backend:

```text
UTC
```

User timezone:

```text
Asia/Dhaka
```

Reports must respect the user's local date.

Do not accidentally make a transaction entered at:

```text
04 October
```

appear as:

```text
03 October
```

because of timezone conversion.

---

# 53. UI Design Direction

Recommended style:

```text
Clean
Modern
Minimal
Professional
Financial dashboard
Large numbers
Rounded cards
Clear typography
Minimal colors
```

Do not overcrowd the dashboard.

The application should feel closer to:

```text
Apple-style simplicity
```

than a traditional accounting ERP.

---

# 54. Responsive Breakpoints

Mobile-first.

Primary:

```text
320px+
```

Mobile:

```text
375px
390px
430px
```

Tablet:

```text
768px+
```

Desktop:

```text
1024px+
```

Desktop can use a sidebar.

Mobile should use bottom navigation.

---

# 55. Accessibility

Buttons must have accessible labels.

Minimum touch target:

```text
44px
```

Use semantic HTML.

Inputs must have labels.

Do not rely only on color to communicate income/expense.

---

# 56. Performance

Target:

```text
Fast initial load
Minimal JavaScript
Lazy-load reports where possible
Paginate transactions
Compress assets
```

Avoid unnecessarily large frameworks.

Frontend should remain:

```text
HTML
CSS
Vanilla JS
```

---

# 57. Testing Requirements

## Authentication

Test:

```text
Register
Login
Logout
Wrong password
Duplicate email
Unauthorized API request
```

## Transactions

Test:

```text
Create income
Create expense
Edit income
Edit expense
Delete transaction
Invalid amount
Invalid category
```

## Balance

Example test:

```text
Opening = 10,000
Income = 5,000
Expense = 2,000

Expected = 13,000
```

## Reports

Verify:

```text
Monthly income
Monthly expense
Net cash flow
Category totals
Date ranges
```

---

# 58. Critical Financial Tests

The AI coding assistant MUST create automated tests for:

### Test 1

```text
Opening = 30,000
Income = 25,000
Expense = 5,000

Expected Balance = 50,000
```

### Test 2

```text
Opening = 10,000
Income = 0
Expense = 3,000

Expected Balance = 7,000
```

### Test 3

```text
Opening = 10,000
Income = 10,000
Expense = 15,000

Expected Balance = 5,000
```

### Test 4

Editing an expense from:

```text
500 → 800
```

must change balance correctly.

### Test 5

Deleting an income must reduce total income and current balance correctly.

---

# 59. Phase-by-Phase Development

The AI coding assistant MUST NOT attempt to build everything at once.

---

## PHASE 1 — Project Setup

Create:

```text
client
server
.gitignore
README
.env.example
```

Configure:

```text
Node.js
Express
MongoDB
Mongoose
```

Verify server starts.

---

## PHASE 2 — Database

Create:

```text
User
Transaction
Category
Settings
```

Create indexes.

Create database connection.

Test MongoDB connection.

---

## PHASE 3 — Authentication

Implement:

```text
Register
Login
Logout
/me
```

Implement:

```text
bcrypt
JWT
secure cookie
auth middleware
```

Test authentication.

---

## PHASE 4 — Transaction Backend

Implement:

```text
POST transaction
GET transactions
GET transaction
PUT transaction
DELETE transaction
```

Add validation.

Test all endpoints.

---

## PHASE 5 — Balance Service

Implement:

```text
Opening balance
Total income
Total expenses
Current balance
Net cash flow
```

Write automated tests.

This phase is financially critical.

---

## PHASE 6 — Dashboard Backend

Create:

```text
GET /api/dashboard
```

Return:

```text
openingBalance
totalIncome
totalExpense
currentBalance
netCashFlow
recentTransactions
```

---

## PHASE 7 — Frontend Foundation

Create:

```text
index.html
login.html
register.html
dashboard.html
transactions.html
reports.html
settings.html
```

Build mobile-first CSS.

---

## PHASE 8 — Authentication UI

Build:

```text
Login
Register
Logout
Session checking
Protected pages
```

---

## PHASE 9 — Dashboard UI

Build:

```text
Balance card
Income card
Expense card
Net cash flow
Recent transactions
Quick actions
```

---

## PHASE 10 — Add Income / Expense

Build reusable transaction modal.

```text
Add Income
Add Expense
Edit Transaction
```

Make the form mobile friendly.

---

## PHASE 11 — Transactions

Implement:

```text
List
Search
Filter
Pagination
Edit
Delete
```

---

## PHASE 12 — Categories

Implement:

```text
List categories
Add
Edit
Disable
```

Do not allow deletion of a category that is required by existing transactions without handling those transactions safely.

---

## PHASE 13 — Reports

Implement:

```text
Monthly summary
Income vs expense
Expense categories
Historical months
Custom date range
```

---

## PHASE 14 — PWA

Implement:

```text
manifest.json
service worker
icons
installability
offline static cache
```

Test on iPhone Safari.

---

## PHASE 15 — Export / Import

Implement:

```text
CSV export
JSON export
JSON import
```

Validate imported data.

---

## PHASE 16 — Security Review

Check:

```text
Authentication
Authorization
Input validation
Rate limiting
Cookies
CORS
Helmet
MongoDB injection
XSS
CSRF considerations
Environment variables
```

---

## PHASE 17 — Production Deployment

Deploy:

```text
Frontend
Backend
MongoDB
HTTPS
Domain
```

Verify:

```text
Login
Transaction creation
Balance
Reports
PWA
Export
```

---

# 60. AI Coding Assistant Rules

The AI assistant must follow these rules.

## Rule 1

Do not change the architecture without approval.

## Rule 2

Do not introduce React, Next.js, Vue, Angular, TypeScript, or another frontend framework.

The required frontend is:

```text
HTML
CSS
Vanilla JavaScript
```

## Rule 3

Do not introduce PostgreSQL/MySQL.

Required database:

```text
MongoDB
```

## Rule 4

Do not build unnecessary features.

MVP must remain a personal cash-flow tracker.

## Rule 5

Before changing database schemas, explain the change.

## Rule 6

Before large multi-file changes, provide a short implementation plan.

## Rule 7

After each phase:

```text
Run tests
Check errors
Fix errors
Verify functionality
```

## Rule 8

Never claim a feature works without testing it.

## Rule 9

Never hardcode secrets.

## Rule 10

Never delete user financial data during development unless explicitly instructed.

---

# 61. AI Development Workflow

For every phase:

```text
1. Read current project
2. Understand existing architecture
3. Explain planned changes
4. Implement
5. Run tests
6. Check console errors
7. Check API errors
8. Fix problems
9. Summarize changes
10. Wait for next phase
```

Do not jump directly from Phase 1 to Phase 17.

---

# 62. Definition of Done

The MVP is complete when the user can:

```text
Register
Login
Set opening balance
Add salary
Add extra income
Add daily expenses
Edit transactions
Delete transactions
See current balance
See monthly income
See monthly expenses
See net cash flow
See expense categories
Search transactions
Filter transactions
Export data
Install PWA on iPhone
Logout
```

And the following formula is always correct:

```text
Opening Balance
+
Income
-
Expenses
=
Current Balance
```

---

# 63. Example Real-Life Usage

User starts October with:

```text
Opening Balance
৳20,000
```

October salary:

```text
+৳25,000
```

Freelance:

```text
+৳7,000
```

A&M project:

```text
+৳10,000
```

Expenses:

```text
Food              ৳4,000
Transport         ৳2,000
Family            ৳5,000
Shopping          ৳3,000
Mobile/Internet   ৳1,000
```

Calculation:

```text
20,000
+25,000
+7,000
+10,000
-4,000
-2,000
-5,000
-3,000
-1,000
----------------
47,000
```

Dashboard:

```text
CURRENT BALANCE

৳47,000


October

Income
৳42,000

Expenses
৳15,000

Net
+৳27,000
```

This is the core experience the entire application should optimize for.

---

# 64. Future Architecture Direction

Although MVP is personal-use only, design the database with:

```text
userId
```

on all user-owned documents.

This allows future expansion to:

```text
Personal Finance SaaS
```

without redesigning the entire database.

Potential future model:

```text
User
  ↓
Workspace
  ↓
Accounts
  ↓
Transactions
  ↓
Reports
```

But this should NOT be implemented in MVP.

---

# 65. Final MVP Architecture

```text
                 iPhone
                   │
                   ▼
          ┌─────────────────┐
          │   PWA Frontend  │
          │ HTML/CSS/JS     │
          └────────┬────────┘
                   │ HTTPS
                   ▼
          ┌─────────────────┐
          │ Node.js         │
          │ Express API     │
          └────────┬────────┘
                   │
                   ▼
          ┌─────────────────┐
          │ MongoDB         │
          │                │
          │ Users           │
          │ Transactions    │
          │ Categories      │
          │ Settings        │
          └─────────────────┘
```

---

# 66. Recommended MVP Philosophy

Do not try to create:

```text
QuickBooks
ERP
Full accounting software
Complex budgeting system
```

Create this:

> **A very fast personal money ledger that tells me where my money came from, where it went, and how much I have now.**

That should be the guiding principle for every development decision.

---

# 67. First Development Command

The AI coding assistant should begin with:

```text
PHASE 1 ONLY.

Read this PRD completely.

Create the initial project structure for the Personal Cash Flow Tracker PWA using:

Frontend:
HTML5
CSS3
Vanilla JavaScript

Backend:
Node.js
Express.js

Database:

MongoDB
Mongoose

Do not implement later phases yet.

First:
1. Create the project structure.
2. Initialize package files.
3. Configure Express.
4. Configure MongoDB connection.
5. Create .env.example.
6. Create a health-check API.
7. Create a basic mobile-first frontend.
8. Add README instructions.
9. Verify that frontend and backend start successfully.
10. Run available tests/checks.

Do not add React, Next.js, Vue, Angular, TypeScript, PostgreSQL, MySQL, or unnecessary dependencies.

After completing Phase 1, report:
- Files created
- Packages installed
- Commands to run
- Environment variables required
- Test results
- Any issues

STOP after Phase 1.
```

---

# 68. Success Metric

The most important success metric is not the number of features.

It is:

> **Can the user record an income or expense in less than 10 seconds and immediately understand their current financial position?**

If yes, the MVP is successful.