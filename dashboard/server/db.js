import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../email-parser/data/emails.db');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema(db);
  }
  return db;
}

function initSchema(db) {
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

// ---- Queries ----

export function insertOrUpdateEmail(data) {
  const db = getDb();
  const stmt = db.prepare(`
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
  `);
  return stmt.run({
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
}

export function updateStatus(messageId, status, extra = {}) {
  const db = getDb();
  const fields = ['status = @status'];
  const params = { messageId, status };

  if (extra.jobId !== undefined) { fields.push('jobId = @jobId'); params.jobId = extra.jobId; }
  if (extra.jobNumber !== undefined) { fields.push('jobNumber = @jobNumber'); params.jobNumber = extra.jobNumber; }
  if (extra.flagReason !== undefined) { fields.push('flagReason = @flagReason'); params.flagReason = extra.flagReason; }
  if (extra.draftReply !== undefined) { fields.push('draftReply = @draftReply'); params.draftReply = extra.draftReply; }
  if (extra.confidence !== undefined) { fields.push('confidence = @confidence'); params.confidence = extra.confidence; }
  if (status === 'flagged' || extra.reviewed) {
    fields.push('reviewedAt = @reviewedAt');
    params.reviewedAt = new Date().toISOString();
    if (extra.reviewedBy) { fields.push('reviewedBy = @reviewedBy'); params.reviewedBy = extra.reviewedBy; }
  }

  const stmt = db.prepare(`UPDATE emails SET ${fields.join(', ')} WHERE messageId = @messageId`);
  return stmt.run(params);
}

export function getEmails({ status, page = 1, limit = 50 }) {
  const db = getDb();
  const offset = (page - 1) * limit;
  let where = '';
  const params = { limit: parseInt(limit), offset };

  if (status && status !== 'all') {
    where = 'WHERE status = @status';
    params.status = status;
  }

  const rows = db.prepare(`SELECT * FROM emails ${where} ORDER BY createdAt DESC LIMIT @limit OFFSET @offset`).all(params);
  const { total } = db.prepare(`SELECT COUNT(*) as total FROM emails ${where}`).get(params);

  return {
    data: rows.map(parseRow),
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    pages: Math.ceil(total / limit),
  };
}

export function getEmailById(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM emails WHERE id = ?').get(id);
  return row ? parseRow(row) : null;
}

export function getStats() {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  const total = db.prepare(`SELECT status, COUNT(*) as count FROM emails GROUP BY status`).all();
  const todayRows = db.prepare(`SELECT status, COUNT(*) as count FROM emails WHERE date(createdAt) = ? GROUP BY status`).all(today);

  const toMap = rows => Object.fromEntries(rows.map(r => [r.status, r.count]));
  return { total: toMap(total), today: toMap(todayRows) };
}

function parseRow(row) {
  return {
    ...row,
    parsedData: row.parsedData ? JSON.parse(row.parsedData) : null,
  };
}
