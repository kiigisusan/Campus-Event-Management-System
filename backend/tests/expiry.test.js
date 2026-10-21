import { expirePendingBookings } from '../src/jobs/expirePendingBookings.js';
import { newQrToken } from '../src/services/bookingService.js';
import { createEvent, createUser, describeDb, prisma, resetDatabase } from './helpers/db.js';

const minutesFromNow = (minutes) => new Date(Date.now() + minutes * 60_000);

describeDb('booking expiry job', () => {
  let event;

  /** A booking holding one seat of `event`, as bookingService would create it. */
  async function holdSeat(data) {
    const student = await createUser();
    await prisma.event.update({
      where: { event_id: event.event_id },
      data: { spots_remaining: { decrement: 1 } },
    });
    return prisma.booking.create({
      data: {
        student_id: student.user_id,
        event_id: event.event_id,
        qr_code: newQrToken(),
        ...data,
      },
    });
  }

  const spotsLeft = async () =>
    (await prisma.event.findUnique({ where: { event_id: event.event_id } })).spots_remaining;

  beforeEach(async () => {
    await resetDatabase();
    event = await createEvent({ capacity: 10, price: 500 });
  });
  afterAll(() => prisma.$disconnect());

  it('cancels unpaid bookings whose hold has run out and releases the seat', async () => {
    const booking = await holdSeat({ status: 'pending', expires_at: minutesFromNow(-1) });
    await prisma.payment.create({
      data: {
        booking_id: booking.booking_id,
        amount: 500,
        phone_number: '254712345678',
        checkout_request_id: 'ws_CO_MOCK_EXPIRED',
      },
    });
    expect(await spotsLeft()).toBe(9);

    const { expired } = await expirePendingBookings();

    expect(expired).toBe(1);
    expect(await spotsLeft()).toBe(10);
    const after = await prisma.booking.findUnique({
      where: { booking_id: booking.booking_id },
      include: { payment: true },
    });
    expect(after.status).toBe('cancelled');
    expect(after.payment.status).toBe('failed');
    const log = await prisma.auditLog.findFirst({ where: { action: 'BOOKING_EXPIRED' } });
    expect(log).toMatchObject({ user_id: null, target_id: booking.booking_id });
  });

  it('leaves bookings that are still within their hold, or already paid', async () => {
    await holdSeat({ status: 'pending', expires_at: minutesFromNow(5) });
    await holdSeat({ status: 'confirmed' });

    const { expired } = await expirePendingBookings();

    expect(expired).toBe(0);
    expect(await spotsLeft()).toBe(8);
  });

  it('expires each booking only once, even if run twice', async () => {
    await holdSeat({ status: 'pending', expires_at: minutesFromNow(-1) });

    const runs = await Promise.all([expirePendingBookings(), expirePendingBookings()]);

    expect(runs[0].expired + runs[1].expired).toBe(1);
    expect(await spotsLeft()).toBe(10);
  });
});
