/**
 * parser.js - Claude AI email parsing logic
 * Extracts job booking fields from unstructured email text
 */

import Anthropic from '@anthropic-ai/sdk';
import config from '../config/default.js';

let client = null;

function getClient() {
  if (!client) {
    if (!config.anthropic.apiKey) throw new Error('ANTHROPIC_API_KEY not set');
    client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return client;
}

function timestamp() {
  return new Date().toISOString();
}

const SYSTEM_PROMPT = `You are a logistics booking assistant for Urgent Couriers NZ. 
Your job is to extract courier booking information from customer emails.

Extract all available information and return ONLY a valid JSON object with this exact structure:
{
  "extracted": {
    "FromAddress": "string or null",
    "ToAddress": "string or null",
    "JobItems": [{ "Items": number, "Weight": number, "Length": number, "Height": number, "Depth": number }],
    "SpeedId": number or null,
    "SpeedLabel": "string or null",
    "Date": "YYYY-MM-DD or null",
    "FromContactName": "string or null",
    "FromPhoneNumber": "string or null",
    "ToContactName": "string or null",
    "ToPhoneNumber": "string or null",
    "Notes": "string or null",
    "ClientRefA": "string or null",
    "BookedBy": "string or null"
  },
  "missingRequired": ["list of missing required field names"],
  "canBook": boolean,
  "replyMessage": "string - polite conversational reply to ask for missing info, or null if all fields present",
  "gibberish": boolean
}

Rules:
- Required fields: FromAddress, ToAddress, JobItems (at least 1 item), SpeedId, Date
- If SpeedId cannot be determined, default to null and add to missingRequired
- SERVICE_MAP for SpeedId: {serviceMapJson}
- If Date is not mentioned, use today: {today}
- For JobItems, if no details given, use [{{"Items":1,"Weight":0,"Length":0,"Height":0,"Depth":0}}]
- JobItems IS considered present if at least 1 item exists (even with zero weight/dims)
- canBook = true only when missingRequired is empty
- replyMessage should be natural English, friendly, mention the specific missing info needed
- gibberish = true if the email makes no sense as a booking request at all
- Do not wrap in markdown, return raw JSON only`;

export async function parseEmail({ subject, body, senderEmail, senderName }) {
  const today = new Date().toISOString().split('T')[0];
  const serviceMapJson = JSON.stringify(config.serviceMap);

  const systemPrompt = SYSTEM_PROMPT
    .replace('{serviceMapJson}', serviceMapJson)
    .replace('{today}', today);

  const userContent = `
Sender: ${senderName || 'Unknown'} <${senderEmail}>
Subject: ${subject || '(no subject)'}
Date received: ${today}

Email body:
---
${body}
---

Extract booking information from this email.`.trim();

  try {
    console.log(`[PARSER] ${timestamp()} Parsing email from ${senderEmail} - "${subject}"`);

    const response = await getClient().messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    });

    const text = response.content[0]?.text?.trim();
    if (!text) throw new Error('Empty response from Claude');

    let parsed;
    try {
      // Strip markdown code fences if Claude wraps anyway
      const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error(`[PARSER] ${timestamp()} Claude returned non-JSON:`, text.slice(0, 200));
      return { gibberish: true, canBook: false, error: 'non-json response' };
    }

    if (parsed.gibberish) {
      console.log(`[PARSER] ${timestamp()} Email flagged as gibberish, skipping`);
      return { gibberish: true, canBook: false };
    }

    // Apply today's date if Claude left it null
    if (!parsed.extracted?.Date) {
      parsed.extracted.Date = today;
      if (parsed.missingRequired) {
        parsed.missingRequired = parsed.missingRequired.filter(f => f !== 'Date');
      }
    }

    // Ensure JobItems has at least a default entry
    if (!parsed.extracted?.JobItems || parsed.extracted.JobItems.length === 0) {
      parsed.extracted.JobItems = [{ Items: 1, Weight: 0, Length: 0, Height: 0, Depth: 0 }];
      if (parsed.missingRequired) {
        parsed.missingRequired = parsed.missingRequired.filter(f => f !== 'JobItems');
      }
    }

    console.log(`[PARSER] ${timestamp()} Parse result: canBook=${parsed.canBook}, missing=${JSON.stringify(parsed.missingRequired)}`);
    return parsed;

  } catch (err) {
    console.error(`[PARSER] ${timestamp()} Error parsing email:`, err.message);
    return { gibberish: false, canBook: false, error: err.message };
  }
}
