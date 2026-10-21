/**
 * QR ticket encoding.
 *
 * The QR image contains "CEMS1:<token>", where <token> is bookings.qr_code
 * (192 random bits, so tickets cannot be guessed or forged). The prefix lets
 * the scanner reject unrelated QR codes (a URL, a Wi-Fi code) with a clear
 * message, and the "1" leaves room to change the format later.
 */
import QRCode from 'qrcode';

const QR_PREFIX = 'CEMS1:';

/** @param {string} token bookings.qr_code */
export const toQrPayload = (token) => `${QR_PREFIX}${token}`;

/**
 * Extracts the ticket token from scanned text. Accepts the bare token too,
 * so an organizer can type it in by hand if the camera fails.
 * @param {string} scannedText
 * @returns {string | null} null if this is not a CEMS ticket
 */
export function parseQrPayload(scannedText) {
  const text = scannedText.trim();
  const token = text.startsWith(QR_PREFIX) ? text.slice(QR_PREFIX.length) : text;
  return /^[A-Za-z0-9_-]{20,64}$/.test(token) ? token : null;
}

/**
 * PNG image of a ticket's QR code.
 * @param {string} token
 * @returns {Promise<Buffer>}
 */
export const qrPngBuffer = (token) =>
  QRCode.toBuffer(toQrPayload(token), {
    type: 'png',
    width: 320,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
