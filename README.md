# Urgent Couriers Email Parser

Monitors a Gmail or Office 365 inbox, parses booking requests using Claude AI, books jobs via the Urgent Couriers API, and replies to customers automatically.

## Features

- 📧 Polls Gmail or O365 every N minutes for unread emails
- 🤖 Uses Claude to extract booking details from unstructured text
- 📦 Books jobs via the Urgent Couriers Booking API (cookie-based auth)
- 💬 Replies to customers asking for missing info (conversational, not a form)
- ✅ Sends job confirmation with reference number on success
- 🏷️ Labels emails as `awaiting-info` or `manual-review` as appropriate
- 🔄 Tracks processed IDs in `data/processed.json` — survives restarts

---

## Setup

### 1. Install dependencies

```bash
cd email-parser
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

---

## Gmail OAuth2 Setup

You need a Google Cloud project with the Gmail API enabled and OAuth2 credentials.

### Step-by-step

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable **Gmail API** under APIs & Services → Library
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Desktop app** (or Web app if deploying on a server)
5. Download the JSON — extract `client_id` and `client_secret`
6. Add the Gmail account (`cs@urgent.co.nz`) as a **Test User** under OAuth consent screen if in testing mode

### Get the refresh token

Use the OAuth2 playground or the quick script below:

```js
// get-token.mjs — run once to get your refresh token
import { google } from 'googleapis';
import readline from 'readline';

const oauth2Client = new google.auth.OAuth2(
  'YOUR_CLIENT_ID',
  'YOUR_CLIENT_SECRET',
  'urn:ietf:wg:oauth:2.0:oob'
);

const url = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/gmail.modify'],
});

console.log('Visit this URL and paste the code:\n', url);

const rl = readline.createInterface({ input: process.stdin });
rl.question('Code: ', async (code) => {
  const { tokens } = await oauth2Client.getToken(code);
  console.log('REFRESH TOKEN:', tokens.refresh_token);
  rl.close();
});
```

Set in `.env`:
```
GMAIL_CLIENT_ID=your_client_id
GMAIL_CLIENT_SECRET=your_client_secret
GMAIL_REFRESH_TOKEN=your_refresh_token
GMAIL_INBOX=cs@urgent.co.nz
```

**Required Gmail scope:** `https://www.googleapis.com/auth/gmail.modify`

---

## Office 365 / Microsoft Graph Setup

Uses **app-only (client credentials)** auth — no user login required.

### Step-by-step

1. Go to [Azure Portal](https://portal.azure.com/) → **Azure Active Directory → App registrations → New registration**
2. Name it (e.g. `UrgentEmailParser`), leave redirect URI blank
3. Go to **Certificates & secrets → New client secret** — copy the value
4. Go to **API permissions → Add permission → Microsoft Graph → Application permissions**
   - Add: `Mail.Read`, `Mail.Send`, `Mail.ReadWrite`
5. Click **Grant admin consent** for your organisation
6. Note the **Application (client) ID** and **Directory (tenant) ID**

Set in `.env`:
```
O365_CLIENT_ID=your_app_client_id
O365_CLIENT_SECRET=your_client_secret
O365_TENANT_ID=your_tenant_id
O365_INBOX=cs@urgent.co.nz
```

---

## Booking API

The Booking API uses ASP.NET Forms authentication. The service:
1. GETs the login page to extract a CSRF token
2. POSTs credentials with the token
3. Stores the session cookie in memory
4. Re-auths automatically on 401

```
BOOKING_URL=https://booking.urgent.co.nz
BOOKING_EMAIL=george@deliverdifferent.com
BOOKING_PASSWORD=your_password
```

---

## Service Configuration

| Variable | Default | Description |
|---|---|---|
| `EMAIL_PROVIDER` | `gmail` | `gmail`, `o365`, or `both` |
| `POLL_INTERVAL_MINUTES` | `2` | How often to check inbox |
| `SERVICE_MAP` | `{"urgent":1,"economy":2,"same day":3,"overnight":4}` | Map email keywords to SpeedId |
| `ANTHROPIC_API_KEY` | — | Claude API key for parsing |

---

## Running

```bash
# Production
npm start

# Dev (auto-restarts on file changes)
npm run dev
```

### With PM2 (recommended for production)

```bash
npm install -g pm2
pm2 start src/index.js --name email-parser --interpreter node
pm2 save
pm2 startup
```

### With Docker

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "src/index.js"]
```

---

## How it works

```
Every 2 minutes:
  → Fetch unread emails from Gmail / O365
  → For each email (not already processed):
      → Mark as read
      → Send to Claude for parsing
      → If gibberish/unrelated → skip, log
      → If missing required fields:
          → Reply asking for missing info (polite, conversational)
          → Label: awaiting-info
          → Save to processed.json
      → If all fields present:
          → POST to Booking API
          → If success: reply with job reference number
          → If failure: reply with apology, label: manual-review
          → Save to processed.json
```

### Required fields Claude extracts

| Field | Notes |
|---|---|
| `FromAddress` | Pickup address |
| `ToAddress` | Delivery address |
| `JobItems` | Items/weight/dims (defaults to 1 item with 0 weight if not specified) |
| `SpeedId` | Service type (mapped from keywords like "urgent", "economy") |
| `Date` | Pickup date (defaults to today if not mentioned) |

### Optional fields

`FromContactName`, `FromPhoneNumber`, `ToContactName`, `ToPhoneNumber`, `Notes`, `ClientRefA`, `BookedBy`

---

## Data

Processed message IDs are stored in `data/processed.json`. Entries older than 30 days are automatically pruned.

---

## Logs

All logs include timestamps and service prefixes:

```
[MAIN] 2025-01-15T02:00:00.000Z Starting Urgent Couriers Email Parser
[GMAIL] 2025-01-15T02:00:01.000Z Polling for unread emails...
[GMAIL] 2025-01-15T02:00:02.000Z Found 3 unread message(s)
[PARSER] 2025-01-15T02:00:02.500Z Parsing email from customer@example.com - "Urgent delivery needed"
[PARSER] 2025-01-15T02:00:04.000Z Parse result: canBook=true, missing=[]
[BOOKER] 2025-01-15T02:00:04.100Z Creating job: 123 Main St → 456 Queen St
[BOOKER] 2025-01-15T02:00:05.200Z Job created successfully: JOB-12345
[GMAIL] 2025-01-15T02:00:05.300Z Reply sent to customer@example.com
```
