/**
 * booker.js - Urgent Couriers Booking API client
 * Handles CSRF-based login and job creation
 */

import axios from 'axios';
import { parse as parseHtml } from 'node-html-parser';
import config from '../config/default.js';

function timestamp() {
  return new Date().toISOString();
}

// In-memory cookie/session state
let sessionCookie = null;
let sessionExpiry = null;

const http = axios.create({
  baseURL: config.booking.url,
  timeout: 15000,
  maxRedirects: 5,
  withCredentials: true,
});

// Intercept to attach session cookie
http.interceptors.request.use((req) => {
  if (sessionCookie) {
    req.headers['Cookie'] = sessionCookie;
  }
  return req;
});

async function extractCsrfToken(html) {
  const root = parseHtml(html);
  const token = root.querySelector('input[name="__RequestVerificationToken"]')?.getAttribute('value');
  if (!token) throw new Error('CSRF token not found in login page');
  return token;
}

function extractSetCookie(response) {
  const setCookieHeaders = response.headers['set-cookie'];
  if (!setCookieHeaders) return null;
  // Join all cookies into a single Cookie header string
  return setCookieHeaders
    .map(c => c.split(';')[0])
    .join('; ');
}

async function login() {
  console.log(`[BOOKER] ${timestamp()} Logging in to booking API...`);

  if (!config.booking.email || !config.booking.password) {
    throw new Error('BOOKING_EMAIL and BOOKING_PASSWORD must be set');
  }

  // Step 1: GET login page to extract CSRF token
  let loginPageResp;
  try {
    loginPageResp = await http.get('/Account/Login');
  } catch (err) {
    throw new Error(`Failed to fetch login page: ${err.message}`);
  }

  const csrfToken = await extractCsrfToken(loginPageResp.data);

  // Capture any initial cookies (antiforgery etc)
  const initialCookies = extractSetCookie(loginPageResp);

  // Step 2: POST credentials
  const formData = new URLSearchParams({
    Email: config.booking.email,
    Password: config.booking.password,
    __RequestVerificationToken: csrfToken,
  });

  let loginResp;
  try {
    loginResp = await http.post('/Account/Login', formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': initialCookies || '',
      },
      maxRedirects: 0,
      validateStatus: (s) => s < 400 || s === 302,
    });
  } catch (err) {
    if (err.response?.status === 302) {
      loginResp = err.response;
    } else {
      throw new Error(`Login POST failed: ${err.message}`);
    }
  }

  const newCookies = extractSetCookie(loginResp);
  if (!newCookies) {
    throw new Error('No session cookie received after login');
  }

  // Merge initial + login cookies
  const allCookies = [initialCookies, newCookies].filter(Boolean).join('; ');
  sessionCookie = allCookies;
  sessionExpiry = Date.now() + 55 * 60 * 1000; // re-auth after 55 min

  console.log(`[BOOKER] ${timestamp()} Login successful`);
}

async function ensureAuth() {
  if (!sessionCookie || Date.now() > (sessionExpiry || 0)) {
    await login();
  }
}

export async function createJob(extracted, senderEmail) {
  await ensureAuth();

  const payload = {
    Date: extracted.Date,
    FromAddress: extracted.FromAddress,
    FromAddressSuburbId: null,
    FromContactName: extracted.FromContactName || null,
    FromPhoneNumber: extracted.FromPhoneNumber || null,
    ToAddress: extracted.ToAddress,
    ToAddressSuburbId: null,
    ToContactName: extracted.ToContactName || null,
    ToPhoneNumber: extracted.ToPhoneNumber || null,
    SpeedId: extracted.SpeedId,
    BookedBy: extracted.BookedBy || 'Email Parser',
    ClientRefA: extracted.ClientRefA || null,
    JobItems: extracted.JobItems.map(item => ({
      Items: item.Items || 1,
      Weight: item.Weight || 0,
      Length: item.Length || 0,
      Height: item.Height || 0,
      Depth: item.Depth || 0,
    })),
    IsBulk: false,
    Recurring: false,
    Notes: [
      extracted.Notes || '',
      `Booked via email from: ${senderEmail}`,
    ].filter(Boolean).join('\n').trim(),
  };

  console.log(`[BOOKER] ${timestamp()} Creating job: ${payload.FromAddress} → ${payload.ToAddress}`);

  try {
    const resp = await http.post('/API/Job', payload, {
      headers: { 'Content-Type': 'application/json' },
    });

    const jobData = resp.data;
    const jobId = jobData?.JobId || jobData?.Id || jobData?.id || jobData;
    console.log(`[BOOKER] ${timestamp()} Job created successfully: ${jobId}`);
    return { success: true, jobId, raw: jobData };

  } catch (err) {
    if (err.response?.status === 401) {
      // Re-auth and retry once
      console.log(`[BOOKER] ${timestamp()} Got 401, re-authenticating...`);
      sessionCookie = null;
      await login();

      const retryResp = await http.post('/API/Job', payload, {
        headers: { 'Content-Type': 'application/json' },
      });
      const jobData = retryResp.data;
      const jobId = jobData?.JobId || jobData?.Id || jobData?.id || jobData;
      console.log(`[BOOKER] ${timestamp()} Job created after re-auth: ${jobId}`);
      return { success: true, jobId, raw: jobData };
    }

    const errMsg = err.response?.data
      ? JSON.stringify(err.response.data).slice(0, 300)
      : err.message;
    console.error(`[BOOKER] ${timestamp()} Job creation failed: ${errMsg}`);
    return { success: false, error: errMsg };
  }
}
