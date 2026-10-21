import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { newQrToken } from '../src/services/bookingService.js';
import { clearOutbox, getOutbox } from '../src/services/emailService.js';
import { notificationSettings, notifyEventCancelled } from '../src/services/notificationService.js';
import { flushBackgroundTasks } from '../src/utils/background.js';
import { signAccessToken } from '../src/utils/tokens.js';
import {
  closeDatabase,
  createEvent,
  createUser,
  describeDb,
  prisma,
  resetDatabase,
} from './helpers/db.js';

// QR PNG generation is much slower inside Jest's sandbox than in Node itself.
jest.setTimeout(30_000);

const app = createApp();
const asUser = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });

describeDb('notification emails', () => {
  let student;

  beforeAll(() => {
    notificationSettings.enabled = true;
  });
  afterAll(async () => {
    notificationSettings.enabled = false;
    await closeDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    clearOutbox();
    student = await createUser({ role: 'student', name: 'Kevin Mwangi' });
  });

  const book = (eventId) =>
    request(app).post('/api/v1/bookings').set(asUser(student)).send({ event_id: eventId });

  it('emails the QR ticket when a free booking is confirmed', async () => {
    const event = await createEvent({ title: 'React Workshop' });

    await book(event.event_id).expect(201);
    await flushBackgroundTasks();

    const [email] = getOutbox();
    expect(email.to).toBe(student.email);
    expect(email.subject).toBe('Booking confirmed: React Workshop');
    expect(email.text).toMatch(/Free event/);
    expect(email.html).toContain('cid:cems-ticket-qr');
    expect(email.attachments).toEqual([expect.stringMatching(/^cems-ticket-\d+\.png$/)]);
  });

  it('emails a paid booking only after M-Pesa confirms it, with the receipt', async () => {
    const event = await createEvent({ price: 500 });
    const { booking_id } = (await book(event.event_id)).body.data.booking;
    await request(app)
      .post(`/api/v1/bookings/${booking_id}/pay`)
      .set(asUser(student))
      .send({ phone_number: '0712345678' })
      .expect(202);
    await flushBackgroundTasks();
    expect(getOutbox()).toHaveLength(0); // not paid yet

    const { checkout_request_id } = await prisma.payment.findUnique({ where: { booking_id } });
    await request(app)
      .post(`/api/v1/payments/mpesa/callback/${process.env.MPESA_CALLBACK_TOKEN}`)
      .send({
        Body: {
          stkCallback: {
            MerchantRequestID: 'm-1',
            CheckoutRequestID: checkout_request_id,
            ResultCode: 0,
            ResultDesc: 'The service request is processed successfully.',
            CallbackMetadata: {
              Item: [
                { Name: 'Amount', Value: 500 },
                { Name: 'MpesaReceiptNumber', Value: 'QKT9XYZ123' },
              ],
            },
          },
        },
      })
      .expect(200);
    await flushBackgroundTasks();

    const [email] = getOutbox();
    expect(email.text).toMatch(/Paid: KES 500 \(M-Pesa QKT9XYZ123\)/);
  });

  it('tells every current attendee when an event is cancelled, escaping user text', async () => {
    const event = await createEvent({ title: '<b>Games Night</b>', price: 300 });
    const others = [await createUser(), await createUser()];
    const ticket = (studentId, status) =>
      prisma.booking.create({
        data: { student_id: studentId, event_id: event.event_id, qr_code: newQrToken(), status },
      });
    const paid = await ticket(student.user_id, 'confirmed');
    await prisma.payment.create({
      data: {
        booking_id: paid.booking_id,
        amount: 300,
        phone_number: '254712345678',
        status: 'completed',
      },
    });
    await ticket(others[0].user_id, 'pending');
    await ticket(others[1].user_id, 'cancelled'); // already gone: no email

    const notified = await notifyEventCancelled(event.event_id, { reason: 'Venue flooded' });
    await flushBackgroundTasks();

    expect(notified).toBe(2);
    const recipients = getOutbox().map((m) => m.to);
    expect(recipients.sort()).toEqual([student.email, others[0].email].sort());

    const paidEmail = getOutbox().find((m) => m.to === student.email);
    expect(paidEmail.text).toMatch(/Reason: Venue flooded/);
    expect(paidEmail.text).toMatch(/refund your M-Pesa payment/);
    expect(paidEmail.html).toContain('&lt;b&gt;Games Night&lt;/b&gt;');
    expect(paidEmail.html).not.toContain('<b>Games Night</b>');
  });
});
