# DFRNT Email Parser — Production Architecture

## Overview
An AI-powered email ingestion service that reads booking requests from Gmail / Office 365, extracts job details using Claude, and books jobs via the DFRNT API. Designed for multi-tenant SaaS deployment.

---

## Current State (Phase 1 — PoC)
- Single Gmail inbox (`george@urgent.co.nz`)
- Single API token (George's staging account)
- Books all jobs under one client
- Creates Gmail drafts for replies
- Polls every 2 minutes

---

## Target Architecture (Production)

### Email Flow
```
Inbound email (Gmail / O365)
  → Automated sender filter (hard skip)
  → Claude Haiku pre-screen: "is this a booking request?"
  → Account lookup: sender email → DFRNT client token
  → Claude Sonnet full parse: extract job fields + confidence score
  → Confidence check:
      < 0.6 → flag for human review, pause booking
      ≥ 0.6 → proceed
  → Missing required fields?
      Yes → draft reply asking for specifics, await response
      No → GET /api/Rates → present service options if not specified
         → POST /api/Jobs → book job
         → draft confirmation reply
  → Log to dashboard DB
```

---

## Multi-Tenant Account Matching

### Phase 1 (Current): Config-based
A JSON config maps sender email / domain to an API token:
```json
{
  "accounts": [
    { "email": "sarah@acme.co.nz", "token": "eyJ...", "clientName": "ACME Ltd" },
    { "domain": "globalfreight.co.nz", "token": "eyJ...", "clientName": "Global Freight" }
  ],
  "fallback": null
}
```
Matching order: exact email → domain → fallback (null = reject unknown senders)

### Phase 2 (Production): API-based lookup
- DFRNT exposes a `GET /api/Contacts/ByEmail?email=` endpoint
- Returns ClientId + available token or generates a short-lived token
- Unknown senders → reply asking them to register at `signup.urgent.co.nz`

### Phase 3 (Full): Self-service onboarding
- Customer signs up via DFRNT portal
- Configures their "booking email" address
- Parser auto-discovers their account from the sender address
- No manual config required

---

## Service Selection Flow

When a customer doesn't specify a service:
1. Call `POST /api/Rates` to get available options
2. Format as a plain English list in the draft reply:
   > "We have the following services available for this route:
   > - **75 Minutes** — $45.00
   > - **Same Day** — $28.50
   > - **Economy** — $18.00
   > Please reply with your preferred option."
3. When they reply, parse the service choice and complete the booking

---

## Confidence Scoring

| Score | Meaning | Action |
|-------|---------|--------|
| 0.9–1.0 | All fields clean, addresses clear | Auto-book |
| 0.6–0.9 | Minor inference (suburb guessed, dims defaulted) | Auto-book + flag in dashboard |
| 0.4–0.6 | Vague address or ambiguous content | Hold for human review |
| 0.0–0.4 | Missing required fields | Draft reply requesting info |

---

## Auto-Flag Rules
Flag for human review if:
- Confidence < 0.6
- Job value > $200 (from rates response)
- Sender not in known accounts
- Dangerous goods mentioned
- Delivery address is residential (private res flag)
- Duplicate booking (same sender + similar address within 1 hour)

---

## Dashboard
See `dashboard/` folder. Provides:
- Real-time monitoring of all processed emails
- Approve / reject / flag controls
- Training interface for improving parse accuracy
- Stats: volume, accuracy, avg confidence, flagged rate

---

## Scaling Considerations

| Volume | Architecture |
|--------|-------------|
| < 100/day | Current polling model, single process |
| 100–1000/day | Webhook-based (Gmail push notifications), still single process |
| 1000+/day | Queue-based (SQS/Redis), worker pool, Postgres |

### Gmail Push Notifications (recommended at scale)
Replace polling with Gmail API push:
- Register a Pub/Sub topic
- Gmail delivers new message IDs in real-time
- Worker pulls full message and processes
- Eliminates polling delay and wasted API calls

---

## Security Considerations
- API tokens stored encrypted at rest (not in plain .env at scale)
- Use AWS Secrets Manager / HashiCorp Vault in production
- Reply drafts reviewed by human before sending (current approach)
- Rate limiting: max N bookings per sender per hour
- Audit log: all bookings traceable to source email + messageId

---

## Roadmap

| Phase | Features |
|-------|---------|
| ✅ Phase 1 | Parse + book + draft replies + dashboard |
| Phase 2 | Multi-tenant account matching, service selection UX |
| Phase 3 | Gmail push webhooks, approval workflow, confidence tuning |
| Phase 4 | Self-service onboarding, O365 support, mobile dashboard |
