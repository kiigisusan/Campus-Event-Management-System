import request from 'supertest';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/utils/tokens.js';
import {
  closeDatabase,
  createEvent,
  createUser,
  describeDb,
  prisma,
  resetDatabase,
} from './helpers/db.js';

const app = createApp();
const CALLBACK_PATH = `/api/v1/payments/mpesa/callback/${process.env.MPESA_CALLBACK_TOKEN}`;
const PHONE = '0712 345 678';

const asUser = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });

/** A callback body in the exact shape Safaricom sends. */
function callbackBody(
  checkoutRequestId,
  { resultCode = 0, amount = 500, receipt = 'QKT1ABC234' } = {},
) {
  const stkCallback = {
    MerchantRequestID: '29115-34620561-1',
    CheckoutRequestID: checkoutRequestId,
    ResultCode: resultCode,
    ResultDesc:
      resultCode === 0
        ? 'The service request is processed successfully.'
        : 'Request cancelled by user',
  };
  if (resultCode === 0) {
    stkCallback.CallbackMetadata = {
      Item: [
        { Name: 'Amount', Value: amount },
        { Name: 'MpesaReceiptNumber', Value: receipt },
        { Name: 'TransactionDate', Value: 20261022143015 },
        { Name: 'PhoneNumber', Value: 254712345678 },
      ],
    };
  }
  return { Body: { stkCallback } };
}

describeDb('M-Pesa payments', () => {
  let student;
  let event;

  const book = async () =>
    (
      await request(app)
        .post('/api/v1/bookings')
        .set(asUser(student))
        .send({ event_id: event.event_id })
    ).body.data.booking;
  const pay = (bookingId, phone = PHONE) =>
    request(app)
      .post(`/api/v1/bookings/${bookingId}/pay`)
      .set(asUser(student))
      .send({ phone_number: phone });
  const sendCallback = (body) => request(app).post(CALLBACK_PATH).send(body);
  const paymentOf = (bookingId) => prisma.payment.findUnique({ where: { booking_id: bookingId } });
  const bookingRow = (bookingId) => prisma.booking.findUnique({ where: { booking_id: bookingId } });

  beforeEach(async () => {
    await resetDatabase();
    student = await createUser({ role: 'student' });
    event = await createEvent({ capacity: 5, price: 500 });
  });
  afterAll(closeDatabase);

  it('sends an STK push and stores the checkout request', async () => {
    const booking = await book();

    const res = await pay(booking.booking_id);

    expect(res.status).toBe(202);
    expect(res.body.data.message).toMatch(/M-Pesa PIN/);
    const payment = await paymentOf(booking.booking_id);
    expect(payment).toMatchObject({ status: 'pending', phone_number: '254712345678' });
    expect(Number(payment.amount)).toBe(500);
    expect(payment.checkout_request_id).toMatch(/^ws_CO_MOCK_/);
  });

  it('confirms the booking only when M-Pesa reports success', async () => {
    const booking = await book();
    await pay(booking.booking_id);
    const { checkout_request_id } = await paymentOf(booking.booking_id);
    expect((await bookingRow(booking.booking_id)).status).toBe('pending');

    const res = await sendCallback(callbackBody(checkout_request_id));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ResultCode: 0, ResultDesc: 'Accepted' });
    expect(await paymentOf(booking.booking_id)).toMatchObject({
      status: 'completed',
      mpesa_receipt: 'QKT1ABC234',
    });
    const view = await request(app)
      .get(`/api/v1/bookings/${booking.booking_id}`)
      .set(asUser(student));
    expect(view.body.data.booking.status).toBe('confirmed');
    expect(view.body.data.booking.qr_code).toEqual(expect.any(String)); // ticket now available
  });

  it('ignores a repeated callback (idempotent)', async () => {
    const booking = await book();
    await pay(booking.booking_id);
    const { checkout_request_id } = await paymentOf(booking.booking_id);

    await sendCallback(callbackBody(checkout_request_id)).expect(200);
    await sendCallback(callbackBody(checkout_request_id)).expect(200);
    await sendCallback(callbackBody(checkout_request_id, { resultCode: 1032 })).expect(200);

    expect((await paymentOf(booking.booking_id)).status).toBe('completed');
    expect((await bookingRow(booking.booking_id)).status).toBe('confirmed');
    expect(await prisma.auditLog.count({ where: { action: 'PAYMENT_COMPLETED' } })).toBe(1);
    const { spots_remaining } = await prisma.event.findUnique({
      where: { event_id: event.event_id },
    });
    expect(spots_remaining).toBe(4);
  });

  it('keeps the seat after a failed payment and allows a retry', async () => {
    const booking = await book();
    await pay(booking.booking_id);
    const first = await paymentOf(booking.booking_id);

    await sendCallback(callbackBody(first.checkout_request_id, { resultCode: 1032 }));

    expect((await paymentOf(booking.booking_id)).status).toBe('failed');
    expect((await bookingRow(booking.booking_id)).status).toBe('pending');

    const retry = await pay(booking.booking_id);
    expect(retry.status).toBe(202);
    const second = await paymentOf(booking.booking_id);
    expect(second.status).toBe('pending');
    expect(second.checkout_request_id).not.toBe(first.checkout_request_id);

    // A late result for the old, replaced prompt must not affect the new one.
    await sendCallback(callbackBody(first.checkout_request_id));
    expect((await paymentOf(booking.booking_id)).status).toBe('pending');
  });

  it('blocks a second prompt while one is in progress (double click)', async () => {
    const booking = await book();

    const [a, b] = await Promise.all([pay(booking.booking_id), pay(booking.booking_id)]);

    expect([a.status, b.status].sort()).toEqual([202, 409]);
    expect([a, b].find((r) => r.status === 409).body.error.code).toBe('PAYMENT_IN_PROGRESS');
  });

  it('treats an underpayment as a failure', async () => {
    const booking = await book();
    await pay(booking.booking_id);
    const { checkout_request_id } = await paymentOf(booking.booking_id);

    await sendCallback(callbackBody(checkout_request_id, { amount: 100 }));

    expect((await paymentOf(booking.booking_id)).status).toBe('failed');
    expect((await bookingRow(booking.booking_id)).status).toBe('pending');
  });

  it('gives the seat back if money arrives after the hold was released and seats remain', async () => {
    const booking = await book();
    await pay(booking.booking_id);
    const { checkout_request_id } = await paymentOf(booking.booking_id);
    // Simulate the hold being released (as the expiry job does) before the callback.
    await prisma.booking.update({
      where: { booking_id: booking.booking_id },
      data: { status: 'cancelled' },
    });
    await prisma.event.update({
      where: { event_id: event.event_id },
      data: { spots_remaining: { increment: 1 } },
    });

    await sendCallback(callbackBody(checkout_request_id));

    expect((await bookingRow(booking.booking_id)).status).toBe('confirmed');
    const { spots_remaining } = await prisma.event.findUnique({
      where: { event_id: event.event_id },
    });
    expect(spots_remaining).toBe(4);
  });

  it('flags a refund if money arrives after the seat was released and the event is full', async () => {
    const booking = await book();
    await pay(booking.booking_id);
    const { checkout_request_id } = await paymentOf(booking.booking_id);
    await prisma.booking.update({
      where: { booking_id: booking.booking_id },
      data: { status: 'cancelled' },
    });
    await prisma.event.update({
      where: { event_id: event.event_id },
      data: { spots_remaining: 0 },
    });

    await sendCallback(callbackBody(checkout_request_id));

    expect((await bookingRow(booking.booking_id)).status).toBe('cancelled');
    const payment = await paymentOf(booking.booking_id);
    expect(payment.status).toBe('completed');
    expect(payment.result_desc).toMatch(/refund required/);
    expect(await prisma.auditLog.count({ where: { action: 'PAYMENT_REFUND_REQUIRED' } })).toBe(1);
  });

  it('rejects callbacks with the wrong secret token', async () => {
    const booking = await book();
    await pay(booking.booking_id);
    const { checkout_request_id } = await paymentOf(booking.booking_id);

    const res = await request(app)
      .post('/api/v1/payments/mpesa/callback/wrong-token-0000000000')
      .send(callbackBody(checkout_request_id));

    expect(res.status).toBe(404);
    expect((await paymentOf(booking.booking_id)).status).toBe('pending');
  });

  it('acknowledges but ignores a malformed callback', async () => {
    const res = await sendCallback({ hello: 'world' });
    expect(res.status).toBe(200);
    expect(res.body.ResultCode).toBe(0);
  });

  it('validates the phone number', async () => {
    const booking = await book();
    const res = await pay(booking.booking_id, '12345');

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('phone_number');
  });

  it('refuses to charge for free, paid or expired bookings', async () => {
    const freeEvent = await createEvent({ price: 0 });
    const free = (
      await request(app)
        .post('/api/v1/bookings')
        .set(asUser(student))
        .send({ event_id: freeEvent.event_id })
    ).body.data.booking;
    expect((await pay(free.booking_id)).body.error.code).toBe('ALREADY_PAID');

    const booking = await book();
    await prisma.booking.update({
      where: { booking_id: booking.booking_id },
      data: { expires_at: new Date(Date.now() - 1000) },
    });
    expect((await pay(booking.booking_id)).body.error.code).toBe('BOOKING_EXPIRED');
  });
});
