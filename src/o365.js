/**
 * o365.js - Office 365 polling and reply via Microsoft Graph API
 */

import 'isomorphic-fetch';
import { Client } from '@microsoft/microsoft-graph-client';
import config from '../config/default.js';
import { isProcessed, markProcessed } from './store.js';
import { parseEmail } from './parser.js';
import { bookJob } from './booker.js';

function timestamp() {
  return new Date().toISOString();
}

// Simple token cache
let accessToken = null;
let tokenExpiry = null;

async function getAccessToken() {
  if (accessToken && Date.now() < (tokenExpiry || 0)) {
    return accessToken;
  }

  if (!config.o365.clientId || !config.o365.clientSecret || !config.o365.tenantId) {
    throw new Error('O365 credentials not configured (O365_CLIENT_ID, O365_CLIENT_SECRET, O365_TENANT_ID)');
  }

  const url = `https://login.microsoftonline.com/${config.o365.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.o365.clientId,
    client_secret: config.o365.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
  });

  const res = await fetch(url, { method: 'POST', body: body.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`O365 token request failed: ${err}`);
  }

  const data = await res.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  console.log(`[O365] ${timestamp()} Access token acquired`);
  return accessToken;
}

function getGraphClient(token) {
  return Client.init({
    authProvider: (done) => done(null, token),
  });
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function replyToMessage(client, inbox, messageId, replyText) {
  try {
    await client
      .api(`/users/${inbox}/messages/${messageId}/reply`)
      .post({
        message: {
          body: {
            contentType: 'Text',
            content: replyText,
          },
        },
      });
    console.log(`[O365] ${timestamp()} Reply sent for message ${messageId}`);
  } catch (err) {
    console.error(`[O365] ${timestamp()} Failed to send reply:`, err.message);
  }
}

async function markMessageRead(client, inbox, messageId) {
  try {
    await client
      .api(`/users/${inbox}/messages/${messageId}`)
      .patch({ isRead: true });
  } catch (err) {
    console.error(`[O365] ${timestamp()} Failed to mark ${messageId} as read:`, err.message);
  }
}

export async function pollO365() {
  console.log(`[O365] ${timestamp()} Polling for unread emails...`);

  if (!config.o365.inbox) {
    console.log(`[O365] ${timestamp()} O365_INBOX not configured, skipping`);
    return;
  }

  let token, client;
  try {
    token = await getAccessToken();
    client = getGraphClient(token);
  } catch (err) {
    console.error(`[O365] ${timestamp()} Auth failed:`, err.message);
    return;
  }

  let messages;
  try {
    const res = await client
      .api(`/users/${config.o365.inbox}/mailFolders/inbox/messages`)
      .filter('isRead eq false')
      .select('id,subject,from,body,receivedDateTime,conversationId')
      .top(20)
      .get();
    messages = res.value || [];
  } catch (err) {
    console.error(`[O365] ${timestamp()} Failed to list messages:`, err.message);
    return;
  }

  console.log(`[O365] ${timestamp()} Found ${messages.length} unread message(s)`);

  for (const msg of messages) {
    const id = msg.id;

    if (isProcessed(id)) {
      console.log(`[O365] ${timestamp()} Skipping already-processed message ${id}`);
      await markMessageRead(client, config.o365.inbox, id);
      continue;
    }

    const subject = msg.subject || '(no subject)';
    const from = msg.from?.emailAddress;
    const senderEmail = from?.address || '';
    const senderName = from?.name || '';
    const bodyContent = msg.body?.contentType === 'html'
      ? stripHtml(msg.body?.content || '')
      : (msg.body?.content || '');

    console.log(`[O365] ${timestamp()} Processing: "${subject}" from ${senderEmail}`);

    // Mark as read immediately
    await markMessageRead(client, config.o365.inbox, id);

    let parseResult;
    try {
      parseResult = await parseEmail({ subject, body: bodyContent, senderEmail, senderName });
    } catch (err) {
      console.error(`[O365] ${timestamp()} Parse error for ${id}:`, err.message);
      markProcessed(id, { result: 'parse-error', senderEmail });
      continue;
    }

    if (parseResult.gibberish || parseResult.error) {
      console.log(`[O365] ${timestamp()} Skipping gibberish/unparseable email from ${senderEmail}`);
      markProcessed(id, { result: 'skipped', senderEmail });
      continue;
    }

    if (!parseResult.canBook) {
      console.log(`[O365] ${timestamp()} Missing fields ${JSON.stringify(parseResult.missingRequired)}, requesting info`);
      const reply = parseResult.replyMessage ||
        `Hi,\n\nThanks for your booking request! We need a few more details: ${parseResult.missingRequired.join(', ')}.\n\nKind regards,\nUrgent Couriers`;

      await replyToMessage(client, config.o365.inbox, id, reply);
      markProcessed(id, { result: 'awaiting-info', senderEmail, missing: parseResult.missingRequired });

    } else {
      const bookResult = await bookJob(parseResult.extracted, senderEmail);

      if (bookResult.success) {
        const confirmation = `Hi ${senderName || 'there'},\n\nYour courier job has been booked!\n\n` +
          `Job Reference: ${bookResult.jobId}\n` +
          `Pickup: ${parseResult.extracted.FromAddress}\n` +
          `Delivery: ${parseResult.extracted.ToAddress}\n` +
          `Date: ${parseResult.extracted.Date}\n\n` +
          `Kind regards,\nUrgent Couriers`;

        await replyToMessage(client, config.o365.inbox, id, confirmation);
        markProcessed(id, { result: 'booked', senderEmail, jobId: bookResult.jobId });
        console.log(`[O365] ${timestamp()} Job ${bookResult.jobId} booked for ${senderEmail}`);

      } else {
        const errorReply = `Hi ${senderName || 'there'},\n\nThank you for your booking request. We encountered a technical issue and our team will follow up shortly.\n\nApologies for the inconvenience.\n\nKind regards,\nUrgent Couriers`;

        await replyToMessage(client, config.o365.inbox, id, errorReply);
        markProcessed(id, { result: 'booking-failed', senderEmail, error: bookResult.error });
        console.error(`[O365] ${timestamp()} Booking failed for ${senderEmail}: ${bookResult.error}`);
      }
    }
  }

  console.log(`[O365] ${timestamp()} Poll complete`);
}
