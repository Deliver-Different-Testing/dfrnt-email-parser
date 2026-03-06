import 'dotenv/config';

function required(key) {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key, fallback = undefined) {
  return process.env[key] || fallback;
}

function parseServiceMap() {
  try {
    return JSON.parse(process.env.SERVICE_MAP || '{"urgent":1,"economy":2,"same day":3,"overnight":4}');
  } catch {
    return { urgent: 1, economy: 2, 'same day': 3, overnight: 4 };
  }
}

const provider = optional('EMAIL_PROVIDER', 'gmail');

const config = {
  provider, // "gmail" | "o365" | "both"

  bookingUrl: optional('BOOKING_URL', 'https://api.urgent.staging.deliverdifferent.com'),
  bookingApiToken: optional('BOOKING_API_TOKEN'),

  gmail: {
    clientId: optional('GMAIL_CLIENT_ID'),
    clientSecret: optional('GMAIL_CLIENT_SECRET'),
    refreshToken: optional('GMAIL_REFRESH_TOKEN'),
    inbox: optional('GMAIL_INBOX', 'cs@urgent.co.nz'),
  },

  o365: {
    clientId: optional('O365_CLIENT_ID'),
    clientSecret: optional('O365_CLIENT_SECRET'),
    tenantId: optional('O365_TENANT_ID'),
    inbox: optional('O365_INBOX'),
  },

  anthropic: {
    apiKey: optional('ANTHROPIC_API_KEY'),
  },

  pollIntervalMinutes: parseInt(optional('POLL_INTERVAL_MINUTES', '2'), 10),
  serviceMap: parseServiceMap(),

  dataDir: new URL('../data', import.meta.url).pathname,
};

export default config;
