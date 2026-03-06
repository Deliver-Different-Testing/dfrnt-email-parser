/**
 * gmail.js - Gmail polling and reply via Google OAuth2
 */

import { google } from 'googleapis';
import config from '../config/default.js';
import { isProcessed, markProcessed } from './store.js';
import { parseEmail } from './parser.js';
import { createJob } from './booker.js';

function timestamp() {
  return new Date().toISOString();
}

let gmailClient = null;

function getGmailClient() {
  if (gmailClient) return gmailClient;

  if (!config.gmail.clientId || !config.gmail.clientSecret || !config.gmail.refreshToken) {
    throw new Error('Gmail OAuth2 credentials not configured (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN)');
  }

  const auth = new google.auth.OAuth2(
    config.gmail.clientId,
    config.gmail.clientSecret,
  );
  auth.setCredentials({ refresh_token: config.gmail.refreshToken });

  gmailClient = google.gmail({ version: 'v1', auth });
  return gmailClient;
}

function decodeBase64(data) {
  if (!data) return '';
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function extractBody(payload) {
  if (!payload) return '';

  // Try plain text first
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  // Try HTML
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    // Strip basic HTML tags
    return decodeBase64(payload.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Recurse into parts
  if (payload.parts) {
    // Prefer text/plain part
    const textPart = payload.parts.find(p => p.mimeType === 'text/plain');
    if (textPart) return extractBody(textPart);
    // Fall back to any part
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }

  return '';
}

function extractHeader(headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

async function getOrCreateLabel(gmail, labelName) {
  try {
    const res = await gmail.users.labels.list({ userId: 'me' });
    const existing = res.data.labels?.find(l => l.name === labelName);
    if (existing) return existing.id;

    const created = await gmail.users.labels.create({
      userId: 'me',
      requestBody: { name: labelName, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
    });
    return created.data.id;
  } catch (err) {
    console.error(`[GMAIL] ${timestamp()} Failed to get/create label "${labelName}":`, err.message);
    return null;
  }
}

async function markAsRead(gmail, messageId) {
  try {
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { removeLabelIds: ['UNREAD'] },
    });
  } catch (err) {
    console.error(`[GMAIL] ${timestamp()} Failed to mark ${messageId} as read:`, err.message);
  }
}

async function applyLabel(gmail, messageId, labelId) {
  if (!labelId) return;
  try {
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { addLabelIds: [labelId] },
    });
  } catch (err) {
    console.error(`[GMAIL] ${timestamp()} Failed to apply label to ${messageId}:`, err.message);
  }
}

async function replyToEmail(gmail, message, threadId, replyText) {
  const headers = message.payload?.headers || [];
  const to = extractHeader(headers, 'from');
  const subject = extractHeader(headers, 'subject');
  const messageId = extractHeader(headers, 'message-id');
  const references = extractHeader(headers, 'references');

  const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

  const rawHeaders = [
    `To: ${to}`,
    `Subject: ${replySubject}`,
    `In-Reply-To: ${messageId}`,
    `References: ${references ? references + ' ' + messageId : messageId}`,
    `Content-Type: text/plain; charset=utf-8`,
    '',
    replyText,
  ].join('\r\n');

  const encoded = Buffer.from(rawHeaders).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  try {
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded, threadId },
    });
    console.log(`[GMAIL] ${timestamp()} Reply sent to ${to}`);
  } catch (err) {
    console.error(`[GMAIL] ${timestamp()} Failed to send reply:`, err.message);
  }
}

export async function pollGmail() {
  console.log(`[GMAIL] ${timestamp()} Polling for unread emails...`);

  let gmail;
  try {
    gmail = getGmailClient();
  } catch (err) {
    console.error(`[GMAIL] ${timestamp()} Client init failed:`, err.message);
    return;
  }

  let messages;
  try {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread in:inbox',
      maxResults: 20,
    });
    messages = res.data.messages || [];
  } catch (err) {
    console.error(`[GMAIL] ${timestamp()} Failed to list messages:`, err.message);
    return;
  }

  console.log(`[GMAIL] ${timestamp()} Found ${messages.length} unread message(s)`);

  const awaitingInfoLabelId = await getOrCreateLabel(gmail, 'awaiting-info');
  const manualReviewLabelId = await getOrCreateLabel(gmail, 'manual-review');

  for (const { id } of messages) {
    if (isProcessed(id)) {
      console.log(`[GMAIL] ${timestamp()} Skipping already-processed message ${id}`);
      await markAsRead(gmail, id);
      continue;
    }

    let fullMessage;
    try {
      const res = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
      fullMessage = res.data;
    } catch (err) {
      console.error(`[GMAIL] ${timestamp()} Failed to fetch message ${id}:`, err.message);
      continue;
    }

    const headers = fullMessage.payload?.headers || [];
    const subject = extractHeader(headers, 'subject');
    const from = extractHeader(headers, 'from');
    const threadId = fullMessage.threadId;

    // Extract sender email and name
    const fromMatch = from.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+)>?$/);
    const senderName = fromMatch?.[1]?.trim() || '';
    const senderEmail = fromMatch?.[2]?.trim() || from;

    const body = extractBody(fullMessage.payload);

    console.log(`[GMAIL] ${timestamp()} Processing: "${subject}" from ${senderEmail}`);

    // Mark as read immediately to avoid reprocessing on crash
    await markAsRead(gmail, id);

    let parseResult;
    try {
      parseResult = await parseEmail({ subject, body, senderEmail, senderName });
    } catch (err) {
      console.error(`[GMAIL] ${timestamp()} Parse error for ${id}:`, err.message);
      markProcessed(id, { result: 'parse-error', senderEmail });
      continue;
    }

    if (parseResult.gibberish || parseResult.error) {
      console.log(`[GMAIL] ${timestamp()} Skipping gibberish/unparseable email from ${senderEmail}`);
      markProcessed(id, { result: 'skipped', senderEmail });
      continue;
    }

    if (!parseResult.canBook) {
      // Missing required fields — ask for more info
      console.log(`[GMAIL] ${timestamp()} Missing fields ${JSON.stringify(parseResult.missingRequired)}, requesting info`);
      const reply = parseResult.replyMessage ||
        `Hi,\n\nThanks for your booking request! We're missing a few details to complete your booking. Could you please provide: ${parseResult.missingRequired.join(', ')}?\n\nKind regards,\nUrgent Couriers`;

      await replyToEmail(gmail, fullMessage, threadId, reply);
      await applyLabel(gmail, id, awaitingInfoLabelId);
      markProcessed(id, { result: 'awaiting-info', senderEmail, missing: parseResult.missingRequired });

    } else {
      // All fields present — book the job
      const bookResult = await createJob(parseResult.extracted, senderEmail);

      if (bookResult.success) {
        const confirmation = `Hi ${senderName || 'there'},\n\nGreat news — your courier job has been booked!\n\n` +
          `Job Reference: ${bookResult.jobId}\n` +
          `Pickup: ${parseResult.extracted.FromAddress}\n` +
          `Delivery: ${parseResult.extracted.ToAddress}\n` +
          `Date: ${parseResult.extracted.Date}\n\n` +
          `If you need to make any changes, please call us or reply to this email with your job reference.\n\n` +
          `Kind regards,\nUrgent Couriers`;

        await replyToEmail(gmail, fullMessage, threadId, confirmation);
        markProcessed(id, { result: 'booked', senderEmail, jobId: bookResult.jobId });
        console.log(`[GMAIL] ${timestamp()} Job ${bookResult.jobId} booked for ${senderEmail}`);

      } else {
        // Booking failed
        const errorReply = `Hi ${senderName || 'there'},\n\nThank you for your booking request. Unfortunately we encountered a technical issue while processing it. Our team has been notified and will follow up with you shortly.\n\nWe apologise for the inconvenience.\n\nKind regards,\nUrgent Couriers`;

        await replyToEmail(gmail, fullMessage, threadId, errorReply);
        await applyLabel(gmail, id, manualReviewLabelId);
        markProcessed(id, { result: 'booking-failed', senderEmail, error: bookResult.error });
        console.error(`[GMAIL] ${timestamp()} Booking failed for ${senderEmail}: ${bookResult.error}`);
      }
    }
  }

  console.log(`[GMAIL] ${timestamp()} Poll complete`);
}
