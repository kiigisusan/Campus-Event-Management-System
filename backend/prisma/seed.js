/**
 * Seeds the database with demo data: every role, categories, venues, events
 * in each status, and a few bookings/payments so dashboards and reports are
 * not empty during development and the presentation.
 *
 * Run with: npm run db:seed
 *
 * Safe to run more than once: reference data is upserted, and events/bookings
 * are only created when the events table is empty.
 *
 * All demo accounts use the password in DEMO_PASSWORD below.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Password123!';
const BCRYPT_ROUNDS = 12;

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo accounts in production.');
  process.exit(1);
}

/** A random, URL-safe token like the ones the booking service puts in QR codes. */
const newQrToken = () => crypto.randomBytes(24).toString('base64url');

/** A DATE value `days` from today (UTC midnight). */
function daysFromToday(days) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** A TIME value. Prisma stores TIME columns as a Date on 1970-01-01 (UTC). */
const timeOfDay = (hhmm) => new Date(`1970-01-01T${hhmm}:00.000Z`);

async function seedCategories() {
  const categories = [
    { name: 'Workshop', description: 'Hands-on skills sessions' },
    { name: 'Career Fair', description: 'Employers, internships and networking' },
    { name: 'Club Night', description: 'Social events run by student clubs' },
    { name: 'Seminar', description: 'Talks and guest lectures' },
    { name: 'Sports', description: 'Tournaments and fitness events' },
  ];

  const byName = {};
  for (const category of categories) {
    byName[category.name] = await prisma.category.upsert({
      where: { name: category.name },
      update: { description: category.description },
      create: category,
    });
  }
  return byName;
}

async function seedVenues() {
  const venues = [
    { name: 'Main Auditorium', location: 'Student Centre, Ground Floor', capacity: 400 },
    { name: 'Lecture Hall 2', location: 'Business School, Level 1', capacity: 120 },
    { name: 'Computer Lab 4', location: 'ICT Building, Level 3', capacity: 40 },
    { name: 'Sports Complex', location: 'East Campus', capacity: 300 },
  ];

  // Venues have no unique column, so look them up by name before creating.
  const byName = {};
  for (const venue of venues) {
    byName[venue.name] =
      (await prisma.venue.findFirst({ where: { name: venue.name } })) ??
      (await prisma.venue.create({ data: venue }));
  }
  return byName;
}

async function seedUsers() {
  const password_hash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

  const users = [
    { name: 'Super Admin', email: 'superadmin@cems.test', role: 'admin', access_level: 2 },
    { name: 'Grace Admin', email: 'admin@cems.test', role: 'admin', access_level: 1 },
    {
      name: 'Brian Otieno',
      email: 'organizer@cems.test',
      role: 'organizer',
      org_name: 'Computer Science Club',
      verified: true,
    },
    {
      name: 'Mercy Wanjiru',
      email: 'organizer2@cems.test',
      role: 'organizer',
      org_name: 'Career Development Office',
      verified: true,
    },
    {
      name: 'Kevin Mwangi',
      email: 'student@cems.test',
      role: 'student',
      student_id_number: '200001',
      programme: 'BSc Computer Science',
    },
    {
      name: 'Aisha Hassan',
      email: 'student2@cems.test',
      role: 'student',
      student_id_number: '200002',
      programme: 'BBIT',
    },
    {
      name: 'Daniel Kiprop',
      email: 'student3@cems.test',
      role: 'student',
      student_id_number: '200003',
      programme: 'BCom',
    },
  ];

  const byEmail = {};
  for (const user of users) {
    byEmail[user.email] = await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: { ...user, password_hash },
    });
  }
  return byEmail;
}

async function seedEventsAndBookings({ categories, venues, users }) {
  if ((await prisma.event.count()) > 0) {
    console.log('Events already exist - skipping events, bookings and payments.');
    return;
  }

  const organizer = users['organizer@cems.test'];
  const careerOffice = users['organizer2@cems.test'];
  const [kevin, aisha, daniel] = [
    users['student@cems.test'],
    users['student2@cems.test'],
    users['student3@cems.test'],
  ];

  const event = (data) =>
    prisma.event.create({
      data: { ...data, spots_remaining: data.spots_remaining ?? data.capacity },
    });

  const reactWorkshop = await event({
    title: 'Intro to React Workshop',
    description: 'Build your first React app in two hours. Bring a laptop with Node.js installed.',
    event_date: daysFromToday(7),
    event_time: timeOfDay('14:00'),
    venue_id: venues['Computer Lab 4'].venue_id,
    capacity: 40,
    spots_remaining: 38, // two confirmed bookings below
    price: 0,
    category_id: categories['Workshop'].category_id,
    organizer_id: organizer.user_id,
    status: 'approved',
  });

  const careerFair = await event({
    title: 'Tech Career Fair 2026',
    description: 'Meet employers offering internships and graduate roles in tech and finance.',
    event_date: daysFromToday(14),
    event_time: timeOfDay('09:00'),
    venue_id: venues['Main Auditorium'].venue_id,
    capacity: 350,
    price: 0,
    category_id: categories['Career Fair'].category_id,
    organizer_id: careerOffice.user_id,
    status: 'approved',
  });

  const clubNight = await event({
    title: 'CS Club Games Night',
    description: 'Board games, video games and pizza. Ticket includes food and drinks.',
    event_date: daysFromToday(10),
    event_time: timeOfDay('18:30'),
    venue_id: venues['Lecture Hall 2'].venue_id,
    capacity: 100,
    spots_remaining: 99, // one paid booking below
    price: 500,
    category_id: categories['Club Night'].category_id,
    organizer_id: organizer.user_id,
    status: 'approved',
  });

  // A past event with a check-in, so attendance reports have data.
  const pastSeminar = await event({
    title: 'AI Ethics Guest Lecture',
    description: 'A guest lecture on responsible AI and data privacy.',
    event_date: daysFromToday(-5),
    event_time: timeOfDay('11:00'),
    venue_id: venues['Lecture Hall 2'].venue_id,
    capacity: 120,
    spots_remaining: 118,
    price: 0,
    category_id: categories['Seminar'].category_id,
    organizer_id: careerOffice.user_id,
    status: 'approved',
  });

  await event({
    title: 'Inter-Faculty Football Tournament',
    description: 'Five-a-side football. Register as an individual; teams are drawn on the day.',
    event_date: daysFromToday(21),
    event_time: timeOfDay('08:00'),
    venue_id: venues['Sports Complex'].venue_id,
    capacity: 200,
    price: 0,
    category_id: categories['Sports'].category_id,
    organizer_id: organizer.user_id,
    status: 'pending', // waiting in the admin approval queue
  });

  await event({
    title: 'Git & GitHub Basics',
    description: 'Draft: version control for beginners.',
    event_date: daysFromToday(28),
    event_time: timeOfDay('15:00'),
    venue_id: venues['Computer Lab 4'].venue_id,
    capacity: 30,
    price: 0,
    category_id: categories['Workshop'].category_id,
    organizer_id: organizer.user_id,
    status: 'draft',
  });

  await event({
    title: 'Late Night Rave',
    description: 'Music event in the auditorium.',
    event_date: daysFromToday(12),
    event_time: timeOfDay('22:00'),
    venue_id: venues['Main Auditorium'].venue_id,
    capacity: 400,
    price: 300,
    category_id: categories['Club Night'].category_id,
    organizer_id: organizer.user_id,
    status: 'rejected',
    rejection_reason: 'Events in the auditorium must end by 10pm. Please choose an earlier time.',
  });

  // Free bookings are confirmed straight away.
  await prisma.booking.createMany({
    data: [
      { student_id: kevin.user_id, event_id: reactWorkshop.event_id, qr_code: newQrToken() },
      { student_id: aisha.user_id, event_id: reactWorkshop.event_id, qr_code: newQrToken() },
      {
        student_id: kevin.user_id,
        event_id: pastSeminar.event_id,
        qr_code: newQrToken(),
        status: 'checked_in',
        checked_in_at: new Date(pastSeminar.event_date.getTime() + 11 * 3600_000),
      },
      { student_id: daniel.user_id, event_id: pastSeminar.event_id, qr_code: newQrToken() },
    ],
  });

  // A paid booking confirmed by a (simulated) successful M-Pesa payment.
  const paidBooking = await prisma.booking.create({
    data: { student_id: daniel.user_id, event_id: clubNight.event_id, qr_code: newQrToken() },
  });
  await prisma.payment.create({
    data: {
      booking_id: paidBooking.booking_id,
      amount: clubNight.price,
      phone_number: '254708374149', // Safaricom sandbox test number
      status: 'completed',
      mpesa_receipt: 'SEED0000001',
      checkout_request_id: 'ws_CO_SEED_0000001',
      merchant_request_id: 'SEED-0001',
      result_code: 0,
      result_desc: 'The service request is processed successfully.',
    },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        user_id: users['admin@cems.test'].user_id,
        action: 'APPROVE_EVENT',
        target_type: 'event',
        target_id: reactWorkshop.event_id,
      },
      {
        user_id: users['admin@cems.test'].user_id,
        action: 'APPROVE_EVENT',
        target_type: 'event',
        target_id: careerFair.event_id,
      },
      {
        user_id: daniel.user_id,
        action: 'PAYMENT_COMPLETED',
        target_type: 'booking',
        target_id: paidBooking.booking_id,
        details: { mpesa_receipt: 'SEED0000001', amount: 500 },
      },
    ],
  });
}

async function main() {
  const categories = await seedCategories();
  const venues = await seedVenues();
  const users = await seedUsers();
  await seedEventsAndBookings({ categories, venues, users });

  console.log('Seed complete. Demo accounts (password: %s):', DEMO_PASSWORD);
  for (const email of Object.keys(users)) console.log(`  - ${email}`);
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
