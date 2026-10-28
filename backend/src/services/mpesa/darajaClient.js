/**
 * Minimal client for Safaricom's Daraja API (M-Pesa Express / STK Push).
 * Docs: https://developer.safaricom.co.ke/APIs/MpesaExpressSimulate
 *
 * MPESA_MODE:
 *  - mock:       no network calls. stkPush returns fake ids and paymentService
 *                simulates Safaricom's callback (see mockResultFor below).
 *  - sandbox:    https://sandbox.safaricom.co.ke (test money, test phone numbers)
 *  - production: https://api.safaricom.co.ke
 */
import crypto from 'node:crypto';
import { env } from '../../config/env.js';

const BASE_URLS = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  production: 'https://api.safaricom.co.ke',
};
const REQUEST_TIMEOUT_MS = 15_000;

/** Daraja's error code while an STK push is still waiting for the customer. */
const STILL_PROCESSING_CODE = '500.001.1001';

export const isMockMode = () => env.MPESA_MODE === 'mock';

export class DarajaError extends Error {
  constructor(message, response) {
    super(message);
    this.name = 'DarajaError';
    this.response = response;
  }
}

/** Full URL Safaricom posts the payment result to. */
export const callbackUrl = () =>
  `${env.MPESA_CALLBACK_BASE_URL}/api/v1/payments/mpesa/callback/${env.MPESA_CALLBACK_TOKEN}`;

/** Daraja wants the timestamp in Kenyan time as YYYYMMDDHHmmss. */
export function darajaTimestamp(date = new Date()) {
  const eat = new Date(date.getTime() + 3 * 60 * 60_000);
  return eat
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14);
}

/** Password = base64(shortcode + passkey + timestamp), as required by Daraja. */
const stkPassword = (timestamp) =>
  Buffer.from(`${env.MPESA_SHORTCODE}${env.MPESA_PASSKEY}${timestamp}`).toString('base64');

/** @type {{ value: string, expiresAt: number } | null} */
let cachedToken = null;

/** OAuth access token, cached until shortly before it expires (Daraja tokens last 1 hour). */
async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const credentials = Buffer.from(
    `${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`,
  ).toString('base64');
  const data = await request('/oauth/v1/generate?grant_type=client_credentials', {
    method: 'GET',
    authorization: `Basic ${credentials}`,
  });

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) - 60) * 1000,
  };
  return cachedToken.value;
}

async function request(path, { method = 'POST', body, authorization }) {
  const response = await fetch(`${BASE_URLS[env.MPESA_MODE]}${path}`, {
    method,
    headers: {
      Authorization: authorization ?? `Bearer ${await getAccessToken()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new DarajaError(data.errorMessage ?? `Daraja returned HTTP ${response.status}`, data);
  }
  return data;
}

/**
 * Sends the "enter your M-Pesa PIN" prompt to the customer's phone.
 *
 * @param {{ phoneNumber: string, amount: number, accountReference: string, description: string }} params
 *   phoneNumber in 2547XXXXXXXX format; amount in whole shillings.
 * @returns {Promise<{ merchantRequestId: string, checkoutRequestId: string, customerMessage: string }>}
 */
export async function stkPush({ phoneNumber, amount, accountReference, description }) {
  if (isMockMode()) {
    const id = crypto.randomBytes(6).toString('hex').toUpperCase();
    return {
      merchantRequestId: `MOCK-${id}`,
      checkoutRequestId: `ws_CO_MOCK_${id}`,
      customerMessage: 'Success. Request accepted for processing (simulated M-Pesa)',
    };
  }

  const timestamp = darajaTimestamp();
  const data = await request('/mpesa/stkpush/v1/processrequest', {
    body: {
      BusinessShortCode: env.MPESA_SHORTCODE,
      Password: stkPassword(timestamp),
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(amount),
      PartyA: phoneNumber,
      PartyB: env.MPESA_SHORTCODE,
      PhoneNumber: phoneNumber,
      CallBackURL: callbackUrl(),
      AccountReference: accountReference.slice(0, 12), // Daraja limit
      TransactionDesc: description.slice(0, 13), // Daraja limit
    },
  });

  if (data.ResponseCode !== '0') {
    throw new DarajaError(data.ResponseDescription ?? 'STK push was not accepted', data);
  }
  return {
    merchantRequestId: data.MerchantRequestID,
    checkoutRequestId: data.CheckoutRequestID,
    customerMessage: data.CustomerMessage,
  };
}

/**
 * Asks Daraja for the final result of an STK push. Used to recover when a
 * callback never arrived (network issue, server restart).
 *
 * @param {string} checkoutRequestId
 * @returns {Promise<{ resultCode: number | null, resultDesc: string }>}
 *   resultCode null = the customer has not finished yet (or mock mode).
 */
export async function stkQuery(checkoutRequestId) {
  if (isMockMode()) {
    return { resultCode: null, resultDesc: 'Mock mode: no status query available' };
  }

  const timestamp = darajaTimestamp();
  try {
    const data = await request('/mpesa/stkpushquery/v1/query', {
      body: {
        BusinessShortCode: env.MPESA_SHORTCODE,
        Password: stkPassword(timestamp),
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      },
    });
    return { resultCode: Number(data.ResultCode), resultDesc: data.ResultDesc };
  } catch (error) {
    if (error instanceof DarajaError && error.response?.errorCode === STILL_PROCESSING_CODE) {
      return { resultCode: null, resultDesc: 'The transaction is being processed' };
    }
    throw error;
  }
}

/**
 * Mock mode only: the result Safaricom "sends" for a given test phone number,
 * so every path can be demonstrated without real M-Pesa:
 *   254700000000 -> customer cancels the prompt (1032)
 *   254711111111 -> insufficient balance (1)
 *   any other    -> payment succeeds
 *
 * @param {string} phoneNumber
 * @param {number} amount
 */
export function mockResultFor(phoneNumber, amount) {
  if (phoneNumber === '254700000000') {
    return { resultCode: 1032, resultDesc: 'Request cancelled by user' };
  }
  if (phoneNumber === '254711111111') {
    return { resultCode: 1, resultDesc: 'The balance is insufficient for the transaction.' };
  }
  return {
    resultCode: 0,
    resultDesc: 'The service request is processed successfully.',
    mpesaReceipt: `MOCK${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    amount,
  };
}
