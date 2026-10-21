import { z } from 'zod';

/**
 * Accepts the ways Kenyans usually type a phone number and normalises it to
 * the 2547XXXXXXXX / 2541XXXXXXXX format Daraja requires:
 *   0712345678, 0112345678, +254712345678, 254 712 345 678
 */
export const kenyanPhoneField = z
  .string({ error: 'Phone number is required' })
  .transform((value) => value.replace(/[\s-]/g, '').replace(/^\+/, ''))
  .transform((value) => (value.startsWith('0') ? `254${value.slice(1)}` : value))
  .pipe(z.string().regex(/^254[17]\d{8}$/, 'Enter a valid Safaricom number, e.g. 0712345678'));

export const payForBookingSchema = z.object({
  phone_number: kenyanPhoneField,
});

/**
 * The part of Safaricom's callback we rely on. Unknown fields are ignored.
 * CallbackMetadata is only present for successful payments.
 */
export const stkCallbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string(),
      CheckoutRequestID: z.string(),
      ResultCode: z.coerce.number().int(),
      ResultDesc: z.string(),
      CallbackMetadata: z
        .object({
          Item: z.array(
            z.object({
              Name: z.string(),
              Value: z.union([z.string(), z.number()]).optional(),
            }),
          ),
        })
        .optional(),
    }),
  }),
});
