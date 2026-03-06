import Anthropic from '@anthropic-ai/sdk';
import config from '../config/default.js';

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

const SYSTEM_PROMPT = `You are a courier booking assistant. Extract job details from booking emails and return structured JSON.

Required fields (flag as missing if not present):
- fromAddress: street address for pickup (string)
- toAddress: street address for delivery (string)  
- jobItems: array of items, each with: quantity (int), weight in kg (number), length cm (number), width cm (number), height cm (number). If dimensions unknown use 20x15x10 as defaults.
- speedId: map service to number — urgent/75min=1, same day=3, overnight=4, economy=2. If unclear, use 3.

Optional fields (extract if present):
- fromSuburb, fromCity, fromPostCode
- toSuburb, toCity, toPostCode
- fromContactName, fromPhoneNumber
- toContactName, toPhoneNumber
- clientRefA (reference number)
- notes (special instructions)
- date (ISO datetime, default to today if not specified)
- bookedBy (sender name)
- senderEmail (sender email address)

Rules:
- "missing" array: list required fields not extractable from the email
- If missing fields, include a natural conversational "replyMessage" asking only for what's needed
- If nothing is missing, "missing" should be empty and omit "replyMessage"
- Never invent addresses — if unclear, flag as missing
- Return ONLY valid JSON, no markdown`;

export async function parseEmail(emailBody, senderEmail, senderName) {
  console.log('[PARSER] Parsing email from:', senderEmail);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Sender email: ${senderEmail || 'unknown'}\nSender name: ${senderName || 'unknown'}\n\nEmail body:\n${emailBody}`,
    }],
  });

  const text = response.content[0].text.replace(/```json\n?|\n?```/g, '').trim();

  try {
    const parsed = JSON.parse(text);
    parsed.senderEmail = senderEmail;
    parsed.bookedBy = parsed.bookedBy || senderName || senderEmail;
    console.log('[PARSER] Missing fields:', parsed.missing?.length ? parsed.missing : 'none');
    return parsed;
  } catch (e) {
    console.error('[PARSER] Failed to parse Claude response:', text.substring(0, 200));
    throw new Error('Failed to parse email content');
  }
}

/**
 * Quick pre-screen: is this email a courier booking request?
 * Returns true/false — fast, cheap, single sentence response.
 */
export async function isBookingRequest(subject, body) {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 10,
    messages: [{
      role: 'user',
      content: `Is this email a request to book a courier pickup or delivery job? Answer only "yes" or "no".

Subject: ${subject}
Body (first 300 chars): ${body.substring(0, 300)}`,
    }],
  });

  const answer = response.content[0].text.trim().toLowerCase();
  return answer.startsWith('yes');
}
