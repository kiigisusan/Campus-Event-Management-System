import { z } from 'zod';
import { idParam } from './common.js';

export const checkInSchema = z.object({
  // Raw text read from the QR code (or the token typed in by hand).
  qr_code: z
    .string({ error: 'Scan a ticket QR code' })
    .trim()
    .min(1, 'Scan a ticket QR code')
    .max(200, 'This is not a CEMS ticket'),
  // The event the scanner is open for. Optional, but recommended.
  event_id: idParam.optional(),
});
