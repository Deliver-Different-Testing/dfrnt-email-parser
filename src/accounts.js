/**
 * accounts.js - Resolve sender email to DFRNT API token
 *
 * Matching order:
 *   1. Exact email match
 *   2. Domain match (e.g. all @acme.co.nz → same account)
 *   3. Fallback: use env token if configured, else null (reject)
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import config from '../config/default.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const accountsPath = join(__dir, '../config/accounts.json');

function loadAccounts() {
  try {
    return JSON.parse(readFileSync(accountsPath, 'utf8'));
  } catch {
    return { accounts: [], fallback: 'use_env_token' };
  }
}

/**
 * Resolve a sender email to their DFRNT API token and client name.
 * Returns { token, clientName } or null if unknown and no fallback.
 */
export function resolveAccount(senderEmail) {
  const { accounts, fallback } = loadAccounts();
  const email = (senderEmail || '').toLowerCase();
  const domain = email.split('@')[1] || '';

  // 1. Exact email match
  const exactMatch = accounts.find(a => a.email?.toLowerCase() === email && a.token);
  if (exactMatch) {
    console.log(`[ACCOUNTS] Matched ${email} → ${exactMatch.clientName} (exact)`);
    return { token: exactMatch.token, clientName: exactMatch.clientName };
  }

  // 2. Domain match
  const domainMatch = accounts.find(a => a.domain?.toLowerCase() === domain && a.token);
  if (domainMatch) {
    console.log(`[ACCOUNTS] Matched ${email} → ${domainMatch.clientName} (domain)`);
    return { token: domainMatch.token, clientName: domainMatch.clientName };
  }

  // 3. Fallback
  if (fallback === 'use_env_token' && config.bookingApiToken) {
    console.log(`[ACCOUNTS] No match for ${email} — using env token fallback`);
    return { token: config.bookingApiToken, clientName: 'Unknown (fallback)' };
  }

  console.warn(`[ACCOUNTS] No account found for ${email} — rejecting`);
  return null;
}
