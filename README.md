# Personal Budget Calculator

A full-stack beginner-friendly personal budget application using HTML, CSS, Vanilla JavaScript, Node.js, Express, and sql.js.

## Features

- Demographic details
- Dynamic income, expense and savings rows
- Monthly calculations
- Savings rate and expense ratio
- Budget assessment and tips
- 12-month FinVerse-style dashboard
- Chart.js analytics
- Excel/XLS/CSV import
- Excel export for saved records
- LocalStorage draft persistence
- SQLite persistence through sql.js
- Records history
- View/delete/export saved records
- Dark mode
- Responsive design
- Windows one-click launcher

## Run on Windows

1. Install Node.js LTS.
2. Open this folder.
3. Double-click `start-server.bat`.

Or run manually:

```bash
npm install
npm start
```

Then open:

http://localhost:3000

## Excel Import Format

The importer works best with columns similar to:

| Month | Category | Type | Amount |
|---|---|---|---:|
| January | Salary | Income | 50000 |
| January | Rent | Expense | 12000 |
| January | Mutual Fund | Investment | 5000 |

It also uses keyword matching when Type is missing.

Supported files:
- .xlsx
- .xls
- .csv

Maximum size: 10 MB.

## Important Vercel note

The included `vercel.json` can serve the frontend as a static site, but the local `sql.js` database is designed for the Node/Express local server. Vercel's serverless filesystem is not a suitable permanent SQLite store.

For a fully persistent Vercel deployment, keep the frontend on Vercel and replace the local sql.js persistence layer with a hosted database such as Postgres/Supabase/Neon. Do not assume `data/budget.sqlite` will persist across Vercel deployments/functions.

## API

- GET `/api/budgets`
- GET `/api/budget/:id`
- POST `/api/budget`
- DELETE `/api/budget/:id`
- POST `/api/import-excel`
- GET `/api/export-excel/:id`

## Data model

The SQLite database is stored locally at:

`data/budget.sqlite`

The database is created automatically on first server start.
