/**
 * logger.js - SQLite logging for email parser
 * Writes to shared DB used by the dashboard
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../data/emails.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        messageId TEXT UNIQUE NOT NULL,
        senderEmail TEXT,
        senderName TEXT,
        subject TEXT,
        body TEXT,
        status TEXT DEFAULT 'skipped',
        parsedData TEXT,
        confidence REAL DEFAULT 0,
        jobId TEXT,
        jobNumber TEXT,
        draftReply TEXT,
        flagReason TEXT,
        createdAt TEXT DEFAULT (datetime('now')),
        reviewedAt TEXT,
        reviewedBy TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_status ON emails(status);
      CREATE INDEX IF NOT EXISTS idx_createdAt ON emails(createdAt);
      CREATE INDEX IF NOT EXISTS idx_messageId ON emails(messageId);
    `);
  }
  return db;
}

/**
 * Insert or update an email record.
 * Call this as soon as you have the email metadata.
 */
export function logEmail(data) {
  try {
    const d = getDb();
    d.prepare(`
      INSERT INTO emails (messageId, senderEmail, senderName, subject, body, status, parsedData, confidence, jobId, jobNumber, draftReply, flagReason, createdAt)
      VALUES (@messageId, @senderEmail, @senderName, @subject, @body, @status, @parsedData, @confidence, @jobId, @jobNumber, @draftReply, @flagReason, @createdAt)
      ON CONFLICT(messageId) DO UPDATE SET
        status = excluded.status,
        parsedData = excluded.parsedData,
        confidence = excluded.confidence,
        jobId = excluded.jobId,
        jobNumber = excluded.jobNumber,
        draftReply = excluded.draftReply,
        flagReason = excluded.flagReason
    `).run({
      messageId: data.messageId,
      senderEmail: data.senderEmail || null,
      senderName: data.senderName || null,
      subject: data.subject || null,
      body: data.body ? data.body.substring(0, 500) : null,
      status: data.status || 'skipped',
      parsedData: data.parsedData ? JSON.stringify(data.parsedData) : null,
      confidence: data.confidence ?? 0,
      jobId: data.jobId || null,
      jobNumber: data.jobNumber || null,
      draftReply: data.draftReply || null,
      flagReason: data.flagReason || null,
      createdAt: data.createdAt || new Date().toISOString(),
    });
  } catch (err) {
    console.error('[LOGGER] Failed to log email:', err.message);
  }
}

/**
 * Update status and optional fields for an existing email record.
 */
export function updateEmailStatus(messageId, status, extra = {}) {
  try {
    const d = getDb();
    const fields = ['status = @status'];
    const params = { messageId, status };

    if (extra.jobId !== undefined)       { fields.push('jobId = @jobId');           params.jobId = extra.jobId; }
    if (extra.jobNumber !== undefined)   { fields.push('jobNumber = @jobNumber');   params.jobNumber = extra.jobNumber; }
    if (extra.flagReason !== undefined)  { fields.push('flagReason = @flagReason'); params.flagReason = extra.flagReason; }
    if (extra.draftReply !== undefined)  { fields.push('draftReply = @draftReply'); params.draftReply = extra.draftReply; }
    if (extra.confidence !== undefined)  { fields.push('confidence = @confidence'); params.confidence = extra.confidence; }
    if (extra.parsedData !== undefined)  { fields.push('parsedData = @parsedData'); params.parsedData = JSON.stringify(extra.parsedData); }

    d.prepare(`UPDATE emails SET ${fields.join(', ')} WHERE messageId = @messageId`).run(params);
  } catch (err) {
    console.error('[LOGGER] Failed to update email status:', err.message);
  }
}

/**
 * Calculate confidence score based on parsed result.
 * @param {object} parsed - result from parseEmail()
 * @returns {number} 0.0 - 1.0
 */
export function calcConfidence(parsed) {
  if (!parsed) return 0;

  const required = ['fromAddress', 'toAddress', 'jobItems'];
  const missing = parsed.missing || [];

  // All required missing → 0
  if (required.every(f => missing.includes(f))) return 0;

  // Any required missing → 0
  if (missing.some(f => required.includes(f))) return 0;

  // Check address quality
  const fromAddr = parsed.fromAddress || '';
  const toAddr = parsed.toAddress || '';
  const vaguePatterns = /^(somewhere|tbd|unknown|n\/a|here|there)$/i;
  if (vaguePatterns.test(fromAddr.trim()) || vaguePatterns.test(toAddr.trim())) return 0.4;

  // Short/vague addresses (< 10 chars suggests suburb/city only)
  if (fromAddr.length < 10 || toAddr.length < 10) return 0.4;

  // Check optional fields — more present = higher confidence
  const optionalPresent = ['fromSuburb', 'fromCity', 'toSuburb', 'toCity', 'fromContactName', 'toContactName']
    .filter(f => parsed[f]).length;

  if (optionalPresent >= 3) return 1.0;
  if (optionalPresent >= 1) return 0.7;

  return 0.7; // all required present, few optionals
}
