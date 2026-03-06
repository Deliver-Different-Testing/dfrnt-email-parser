import axios from 'axios';
import config from '../config/default.js';

let jwtToken = null;

/**
 * Login to DFRNT API and get JWT token
 */
async function authenticate() {
  console.log('[BOOKER] Authenticating with DFRNT API...');
  const res = await axios.post(`${config.bookingUrl}/api/Home/Login`, {
    Username: config.bookingEmail,
    Password: config.bookingPassword,
  });

  if (!res.data?.token) {
    throw new Error('[BOOKER] No token returned from login');
  }

  jwtToken = res.data.token;
  console.log('[BOOKER] Authenticated successfully');
}

/**
 * Returns axios instance with JWT auth header
 */
function apiClient() {
  return axios.create({
    baseURL: config.bookingUrl,
    headers: {
      Authorization: `Bearer ${jwtToken}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Book a job via DFRNT API POST /api/Jobs
 * @param {object} jobData - parsed job fields from parser.js
 * @returns {object} - API response with job number
 */
export async function bookJob(jobData) {
  if (!jwtToken) await authenticate();

  const payload = buildPayload(jobData);

  try {
    const res = await apiClient().post('/api/Jobs', payload);
    console.log('[BOOKER] Job booked successfully:', res.data);
    return res.data;
  } catch (err) {
    if (err.response?.status === 401) {
      console.log('[BOOKER] Token expired, re-authenticating...');
      jwtToken = null;
      await authenticate();
      const res = await apiClient().post('/api/Jobs', payload);
      return res.data;
    }
    console.error('[BOOKER] Booking failed:', err.response?.data || err.message);
    throw err;
  }
}

/**
 * Map parsed job fields to DFRNT BookPickup payload
 */
function buildPayload(job) {
  return {
    SpeedId: job.speedId || config.defaultSpeedId,
    DateTime: job.date || new Date().toISOString(),
    JobType: 0, // Pickup = default
    Pickup: {
      Name: job.fromContactName || job.bookedBy || 'Email Booking',
      ContactPerson: job.fromContactName || job.bookedBy || 'Email Booking',
      PhoneNumber: job.fromPhoneNumber || '',
      Email: job.senderEmail || '',
      Notes: job.notes || '',
      From: {
        StreetAddress: job.fromAddress,
        Suburb: job.fromSuburb || '',
        City: job.fromCity || '',
        PostCode: job.fromPostCode || '',
        CountryCode: 'NZ',
      },
    },
    Delivery: {
      Name: job.toContactName || 'Recipient',
      ContactPerson: job.toContactName || '',
      PhoneNumber: job.toPhoneNumber || '',
      Email: job.toEmail || '',
      Notes: job.deliveryNotes || '',
      To: {
        StreetAddress: job.toAddress,
        Suburb: job.toSuburb || '',
        City: job.toCity || '',
        PostCode: job.toPostCode || '',
        CountryCode: 'NZ',
      },
    },
    Packages: buildPackages(job.jobItems),
    ClientReferenceA: job.clientRefA || '',
    ClientNotes: `Booked via email from: ${job.senderEmail || 'unknown'}`,
    JobNotificationType: 'EMAIL',
    JobNotificationEmail: job.senderEmail || '',
    IsSignatureRequired: true,
    IsSaturdayDelivery: false,
    IsDangerousGoods: false,
    SourceId: 5, // Email parser source
  };
}

function buildPackages(items) {
  if (!items || items.length === 0) {
    return [{
      Quantity: 1,
      Weight: 0,
      Length: 0,
      Height: 0,
      Width: 0,
    }];
  }

  return items.map(item => ({
    Quantity: item.items || item.quantity || 1,
    Weight: item.weight || 0,
    Length: item.length || 0,
    Height: item.height || 0,
    Width: item.depth || item.width || 0,
    Description: item.notes || '',
  }));
}
