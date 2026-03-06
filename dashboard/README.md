# DFRNT Email Parser Dashboard

A monitoring and training dashboard for the DFRNT email parser service.

## Architecture

- **Backend**: Express API (port 3001) — reads from shared SQLite DB
- **Frontend**: React + Vite (port 5173) — real-time dashboard with auto-refresh
- **Shared DB**: `/data/.openclaw/workspace/projects/email-parser/data/emails.db`

## Features

- Stats bar: today vs all-time counts by status
- Email list with status badges, confidence scores, action buttons
- Email detail panel: parsed fields, draft reply, raw body
- Status filter tabs: All | Booked | Awaiting Info | Flagged | Errors | Skipped
- Auto-refresh every 30 seconds
- Approve / reject / flag actions per email
- Confidence scoring (0–100%) with color indicators

## Setup

### Prerequisites

```bash
# In email-parser-dashboard/
npm install

# In email-parser/ (adds better-sqlite3 for logging)
npm install
```

### Start the dashboard server

```bash
cd email-parser-dashboard
npm run server    # Express API on :3001
```

### Start the frontend dev server

```bash
cd email-parser-dashboard
npm run client    # Vite on :5173
```

### Start both at once

```bash
cd email-parser-dashboard
npm run dev       # Runs both concurrently
```

### Start the email parser (in a separate terminal)

```bash
cd email-parser
npm start
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/emails` | Paginated email list (`?status=&page=&limit=`) |
| GET | `/api/emails/:id` | Single email detail |
| POST | `/api/emails/:id/flag` | Flag with reason `{ reason }` |
| POST | `/api/emails/:id/approve` | Mark approved `{ reviewedBy }` |
| POST | `/api/emails/:id/reject` | Mark rejected `{ reason, reviewedBy }` |
| GET | `/api/stats` | Counts by status (today + all time) |
| GET | `/api/health` | Service health check |

## Confidence Scoring

| Score | Meaning |
|-------|---------|
| 1.0 | All required + optional fields extracted cleanly |
| 0.7 | Required fields present, few optionals |
| 0.4 | Address looks vague or incomplete |
| 0.0 | Missing required fields |

Emails with confidence < 0.6 are auto-flagged for human review.

## Integration

The email parser (`src/logger.js`) logs every processed email to SQLite with:
- Initial log on first contact
- Status updates as processing progresses
- Final status: `booked` | `awaiting-info` | `skipped` | `flagged` | `error`
