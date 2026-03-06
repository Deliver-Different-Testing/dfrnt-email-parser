import axios from 'axios';
import config from '../config/default.js';

function apiClient(tokenOverride) {
  return axios.create({
    baseURL: config.bookingUrl,
    headers: {
      Authorization: `Bearer ${tokenOverride || config.bookingApiToken}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Get rates for a job, returns array of available rates
 */
async function getRates(from, to, packages, tokenOverride) {
  console.log('[BOOKER] Getting rates...');
  const res = await apiClient(tokenOverride).post('/api/Rates', { from, to, packages });
  const rates = res.data?.rates || res.data || [];
  console.log(`[BOOKER] ${rates.length} rates available`);
  return rates;
}

/**
 * Pick the best rate matching the requested speedId, or cheapest if not found
 */
function pickRate(rates, requestedSpeedId) {
  const match = rates.find(r => r.speedId === requestedSpeedId);
  if (match) return match;
  // Fall back: sort by amount, pick cheapest
  return rates.sort((a, b) => a.amount - b.amount)[0];
}

/**
 * Map speed keyword to SpeedId
 */
export function resolveSpeedId(speedKeyword) {
  const map = config.serviceMap || {};
  const key = (speedKeyword || '').toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (key.includes(k)) return v;
  }
  return null; // let getRates decide
}

/**
 * Full flow: get rates → pick rate → book job
 */
export async function bookJob(job, tokenOverride) {
  const from = {
    streetAddress: job.fromAddress,
    suburb: job.fromSuburb || '',
    city: job.fromCity || job.fromSuburb || 'Auckland',
    postCode: job.fromPostCode || '',
    countryCode: 'NZ',
  };

  const to = {
    streetAddress: job.toAddress,
    suburb: job.toSuburb || '',
    city: job.toCity || job.toSuburb || 'Auckland',
    postCode: job.toPostCode || '',
    countryCode: 'NZ',
  };

  const packages = buildPackages(job.jobItems);

  // Step 1: Get rates
  const rates = await getRates(from, to, packages);
  if (!rates.length) throw new Error('No rates available for this route');

  // Step 2: Pick rate
  const chosen = pickRate(rates, job.speedId);
  console.log(`[BOOKER] Using SpeedId=${chosen.speedId} QuoteId=${chosen.quoteId} $${chosen.amount}`);

  // Step 3: Book
  const res = await apiClient(tokenOverride).post('/api/Jobs', {
    quoteId: chosen.quoteId,
    speedId: chosen.speedId,
    dateTime: job.date || new Date().toISOString(),
    pickup: {
      name: job.fromContactName || job.bookedBy || 'Email Booking',
      contactPerson: job.fromContactName || job.bookedBy || 'Email Booking',
      phoneNumber: job.fromPhoneNumber || '',
      from,
      notes: job.notes || '',
    },
    delivery: {
      name: job.toContactName || 'Recipient',
      contactPerson: job.toContactName || '',
      phoneNumber: job.toPhoneNumber || '',
      to,
      notes: job.deliveryNotes || '',
    },
    packages,
    clientReferenceA: job.clientRefA || '',
    clientNotes: `Booked via email from: ${job.senderEmail || 'unknown'}`,
    jobNotificationType: 'EMAIL',
    jobNotificationEmail: job.senderEmail || '',
    isSignatureRequired: true,
  });

  console.log('[BOOKER] Job booked! ID:', res.data?.jobID);
  return res.data;
}

function buildPackages(items) {
  if (!items || !items.length) {
    return [{ units: 1, kg: 1, length: 20, width: 15, height: 10, name: 'custom' }];
  }
  return items.map(item => ({
    units: item.quantity || item.units || 1,
    kg: item.weight || item.kg || 1,
    length: item.length || 20,
    width: item.width || 15,
    height: item.height || 10,
    name: item.description || 'custom',
  }));
}

/**
 * Get rates for a parsed job without booking — used for service selection UX
 */
export async function getRatesForJob(job, tokenOverride) {
  const from = {
    streetAddress: job.fromAddress,
    suburb: job.fromSuburb || '',
    city: job.fromCity || 'Auckland',
    postCode: job.fromPostCode || '',
    countryCode: 'NZ',
  };
  const to = {
    streetAddress: job.toAddress,
    suburb: job.toSuburb || '',
    city: job.toCity || 'Auckland',
    postCode: job.toPostCode || '',
    countryCode: 'NZ',
  };
  const packages = buildPackages(job.jobItems);
  return getRates(from, to, packages, tokenOverride);
}
