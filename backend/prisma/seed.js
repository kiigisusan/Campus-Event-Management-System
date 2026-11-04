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
    { name: 'Hackathon', description: 'Team coding challenges with prizes' },
    { name: 'Cultural', description: 'Music, dance, drama and cultural celebrations' },
    { name: 'Health & Wellness', description: 'Mental and physical wellbeing activities' },
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
    { name: 'Library Conference Room', location: 'Library, Level 2', capacity: 60 },
    { name: 'Open-Air Amphitheatre', location: 'West Campus', capacity: 250 },
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

/** Extra students (student4 to student18), so events and reports have realistic numbers. */
const EXTRA_STUDENTS = [
  ['Faith Njeri', 'BSc Computer Science'],
  ['Brian Kipchoge', 'BBIT'],
  ['Mary Atieno', 'BCom'],
  ['John Mutua', 'BSc Informatics'],
  ['Esther Wambui', 'BSc Computer Science'],
  ['Peter Ochieng', 'LLB'],
  ['Grace Chebet', 'BCom'],
  ['Tom Kiplagat', 'BBIT'],
  ['Lucy Nyambura', 'BSc Actuarial Science'],
  ['Victor Omondi', 'BSc Computer Science'],
  ['Joy Wangari', 'BA Communication'],
  ['Collins Kibet', 'BSc Informatics'],
  ['Naomi Akinyi', 'BCom'],
  ['Eric Maina', 'BBIT'],
  ['Ruth Jeptoo', 'BSc Computer Science'],
];

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
    {
      name: 'Linet Achieng',
      email: 'organizer3@cems.test',
      role: 'organizer',
      org_name: 'Student Council',
      verified: true,
    },
    {
      name: 'Samuel Kamau',
      email: 'organizer4@cems.test',
      role: 'organizer',
      org_name: 'Drama Society',
      verified: false, // shows an unverified organizer in the admin Users page
    },
    ...EXTRA_STUDENTS.map(([name, programme], i) => ({
      name,
      email: `student${i + 4}@cems.test`,
      role: 'student',
      student_id_number: String(200004 + i),
      programme,
      // The last one is deactivated, to show a deactivated account.
      is_active: i < EXTRA_STUDENTS.length - 1,
    })),
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

/**
 * More events on top of the core set: upcoming, past (with check-ins and
 * no-shows for attendance reports), sold out, paid, and every other status.
 * `booked` students hold a seat; on past events the first `checkedIn` of them
 * attended. `cancelled` students booked and then cancelled (on a paid event,
 * their M-Pesa payment failed).
 */
const EXTRA_EVENTS = [
  // Upcoming
  {
    title: 'Hackathon: Build for Campus',
    description:
      '24-hour team hackathon. Build something that makes campus life easier. Prizes for the top three teams.',
    days: 18,
    time: '09:00',
    venue: 'Computer Lab 4',
    capacity: 40,
    price: 0,
    category: 'Hackathon',
    organizer: 'organizer@cems.test',
    status: 'approved',
    booked: 9,
  },
  {
    title: 'Cultural Week Opening Night',
    description: 'Music, dance and food from across Kenya and beyond to open Cultural Week.',
    days: 5,
    time: '17:00',
    venue: 'Open-Air Amphitheatre',
    capacity: 250,
    price: 200,
    category: 'Cultural',
    organizer: 'organizer3@cems.test',
    status: 'approved',
    booked: 11,
  },
  {
    title: 'Mental Health Awareness Talk',
    description:
      'Counsellors from Student Affairs on managing stress during exams, and where to get help.',
    days: 3,
    time: '13:00',
    venue: 'Lecture Hall 2',
    capacity: 120,
    price: 0,
    category: 'Health & Wellness',
    organizer: 'organizer3@cems.test',
    status: 'approved',
    booked: 6,
    cancelled: 2,
  },
  {
    title: 'CV Clinic with Recruiters',
    description: 'One-to-one CV reviews with recruiters from partner companies. Limited places.',
    days: 6,
    time: '10:00',
    venue: 'Library Conference Room',
    capacity: 12,
    price: 0,
    category: 'Career Fair',
    organizer: 'organizer2@cems.test',
    status: 'approved',
    booked: 12, // sold out
  },
  {
    title: 'Python for Data Analysis',
    description: 'Pandas and Matplotlib from scratch, using real datasets. Bring a laptop.',
    days: 9,
    time: '14:00',
    venue: 'Computer Lab 4',
    capacity: 35,
    price: 150,
    category: 'Workshop',
    organizer: 'organizer@cems.test',
    status: 'approved',
    booked: 7,
    cancelled: 1,
  },
  {
    title: 'Basketball 3x3 Tournament',
    description: 'Three-a-side basketball. Sign up on your own; teams are drawn on the day.',
    days: 16,
    time: '08:30',
    venue: 'Sports Complex',
    capacity: 120,
    price: 0,
    category: 'Sports',
    organizer: 'organizer3@cems.test',
    status: 'approved',
    booked: 10,
  },
  {
    title: 'Startup Pitch Night',
    description: 'Student founders pitch to a panel of investors. Networking afterwards.',
    days: 24,
    time: '18:00',
    venue: 'Main Auditorium',
    capacity: 300,
    price: 100,
    category: 'Seminar',
    organizer: 'organizer2@cems.test',
    status: 'approved',
    booked: 5,
  },

  // Past, with attendance
  {
    title: 'Cloud Computing Bootcamp',
    description: 'A one-day introduction to deploying apps on the cloud.',
    days: -12,
    time: '09:00',
    venue: 'Computer Lab 4',
    capacity: 40,
    price: 0,
    category: 'Workshop',
    organizer: 'organizer@cems.test',
    status: 'approved',
    booked: 14,
    checkedIn: 11,
  },
  {
    title: 'Semester Career Fair',
    description: 'Over 30 employers recruiting for internships and graduate roles.',
    days: -30,
    time: '09:00',
    venue: 'Main Auditorium',
    capacity: 350,
    price: 0,
    category: 'Career Fair',
    organizer: 'organizer2@cems.test',
    status: 'approved',
    booked: 16,
    checkedIn: 13,
  },
  {
    title: "Freshers' Movie Night",
    description: 'Outdoor screening for first-years, with popcorn and drinks included.',
    days: -20,
    time: '19:00',
    venue: 'Open-Air Amphitheatre',
    capacity: 250,
    price: 250,
    category: 'Club Night',
    organizer: 'organizer3@cems.test',
    status: 'approved',
    booked: 13,
    checkedIn: 10,
  },
  {
    title: 'Yoga and Mindfulness Morning',
    description: 'A gentle yoga session followed by a guided mindfulness practice. Mats provided.',
    days: -8,
    time: '07:00',
    venue: 'Sports Complex',
    capacity: 60,
    price: 0,
    category: 'Health & Wellness',
    organizer: 'organizer3@cems.test',
    status: 'approved',
    booked: 8,
    checkedIn: 7,
  },
  {
    title: 'Cybersecurity Seminar',
    description:
      'How attackers break into systems, and how to stop them. Guest speaker from industry.',
    days: -45,
    time: '11:00',
    venue: 'Lecture Hall 2',
    capacity: 120,
    price: 0,
    category: 'Seminar',
    organizer: 'organizer@cems.test',
    status: 'approved',
    booked: 10,
    checkedIn: 6,
  },
  {
    title: 'Inter-Club Hackathon',
    description: 'Clubs competed to build the best campus app in 12 hours.',
    days: -60,
    time: '08:00',
    venue: 'Library Conference Room',
    capacity: 60,
    price: 0,
    category: 'Hackathon',
    organizer: 'organizer@cems.test',
    status: 'approved',
    booked: 12,
    checkedIn: 11,
  },

  // Other statuses
  {
    title: 'Drama Society Showcase',
    description: 'Three short plays written and performed by students.',
    days: 30,
    time: '18:30',
    venue: 'Main Auditorium',
    capacity: 300,
    price: 150,
    category: 'Cultural',
    organizer: 'organizer4@cems.test',
    status: 'pending',
  },
  {
    title: 'Robotics Demo Day',
    description: 'See the robots built by the Robotics Club and try controlling them yourself.',
    days: 26,
    time: '10:00',
    venue: 'Library Conference Room',
    capacity: 50,
    price: 0,
    category: 'Workshop',
    organizer: 'organizer@cems.test',
    status: 'pending',
  },
  {
    title: 'Charity Fun Run',
    description: '5 km fun run raising money for the children’s hospital.',
    days: 4,
    time: '07:30',
    venue: 'Sports Complex',
    capacity: 200,
    price: 0,
    category: 'Sports',
    organizer: 'organizer3@cems.test',
    status: 'cancelled',
    cancelled: 3,
  },
  {
    title: 'Open Mic Night',
    description: 'Poetry, comedy and music. Anyone can perform.',
    days: 15,
    time: '20:00',
    venue: 'Open-Air Amphitheatre',
    capacity: 250,
    price: 0,
    category: 'Cultural',
    organizer: 'organizer4@cems.test',
    status: 'rejected',
    rejection_reason:
      'Please add a security and crowd-control plan for an outdoor event of this size.',
  },
  {
    title: 'Excel Skills Refresher',
    description: 'Draft: formulas, pivot tables and charts for coursework.',
    days: 20,
    time: '15:00',
    venue: 'Computer Lab 4',
    capacity: 35,
    price: 0,
    category: 'Workshop',
    organizer: 'organizer2@cems.test',
    status: 'draft',
  },
];

const HOUR = 3600_000;

/** The moment an event starts (event_date is UTC midnight, so add the time of day). */
const eventStart = (date, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(date.getTime() + (h * 60 + m) * 60_000);
};

/**
 * Creates each event in EXTRA_EVENTS that is not already in the database (by
 * title), with its bookings, payments and audit trail. Safe to run again.
 */
async function seedExtraEvents({ categories, venues, users }) {
  const admin = users['admin@cems.test'];
  const students = Object.values(users).filter((u) => u.role === 'student');
  let created = 0;

  for (const [index, spec] of EXTRA_EVENTS.entries()) {
    if (await prisma.event.findFirst({ where: { title: spec.title } })) continue;

    const booked = spec.booked ?? 0;
    const cancelled = spec.cancelled ?? 0;
    const date = daysFromToday(spec.days);
    const start = eventStart(date, spec.time);
    const organizer = users[spec.organizer];

    const event = await prisma.event.create({
      data: {
        title: spec.title,
        description: spec.description,
        event_date: date,
        event_time: timeOfDay(spec.time),
        venue_id: venues[spec.venue].venue_id,
        capacity: spec.capacity,
        spots_remaining: spec.capacity - booked,
        price: spec.price,
        category_id: categories[spec.category].category_id,
        organizer_id: organizer.user_id,
        status: spec.status,
        rejection_reason: spec.rejection_reason ?? null,
      },
    });

    // Event history: created a few weeks before it starts, then submitted and reviewed.
    const createdAt = new Date(Math.min(start.getTime() - 21 * 24 * HOUR, Date.now() - 2 * HOUR));
    const log = [{ user_id: organizer.user_id, action: 'CREATE_EVENT', timestamp: createdAt }];
    if (spec.status !== 'draft') {
      log.push({
        user_id: organizer.user_id,
        action: 'SUBMIT_EVENT',
        timestamp: new Date(createdAt.getTime() + HOUR),
      });
    }
    if (['approved', 'cancelled', 'rejected'].includes(spec.status)) {
      log.push({
        user_id: admin.user_id,
        action: spec.status === 'rejected' ? 'REJECT_EVENT' : 'APPROVE_EVENT',
        timestamp: new Date(createdAt.getTime() + 20 * HOUR),
        ...(spec.rejection_reason && { details: { reason: spec.rejection_reason } }),
      });
    }
    if (spec.status === 'cancelled') {
      log.push({
        user_id: organizer.user_id,
        action: 'CANCEL_EVENT',
        timestamp: new Date(Date.now() - HOUR),
      });
    }

    // Each event takes a different run of students, so bookings are spread across them.
    const offset = (index * 5) % students.length;
    const attendees = Array.from(
      { length: booked + cancelled },
      (_, i) => students[(offset + i) % students.length],
    );

    for (const [i, student] of attendees.entries()) {
      const isCancelled = i >= booked;
      const isCheckedIn = !isCancelled && i < (spec.checkedIn ?? 0);
      const bookedAt = new Date(
        Math.min(start.getTime() - (2 + i) * 24 * HOUR, Date.now() - (i + 1) * HOUR),
      );

      const booking = await prisma.booking.create({
        data: {
          student_id: student.user_id,
          event_id: event.event_id,
          qr_code: newQrToken(),
          booking_date: bookedAt,
          status: isCancelled ? 'cancelled' : isCheckedIn ? 'checked_in' : 'confirmed',
          checked_in_at: isCheckedIn ? new Date(start.getTime() + (5 + 3 * i) * 60_000) : null,
        },
      });
      log.push({
        user_id: student.user_id,
        action: 'BOOKING_CREATED',
        target_type: 'booking',
        target_id: booking.booking_id,
        timestamp: bookedAt,
      });

      if (spec.price > 0) {
        const paid = !isCancelled;
        const ref = `${event.event_id}_${student.user_id}`;
        await prisma.payment.create({
          data: {
            booking_id: booking.booking_id,
            amount: spec.price,
            phone_number: `2547${String(10000000 + student.user_id * 7919).slice(-8)}`,
            status: paid ? 'completed' : 'failed',
            mpesa_receipt: paid ? `SEED${ref}` : null,
            checkout_request_id: `ws_CO_SEED_${ref}`,
            merchant_request_id: `SEED-${ref}`,
            result_code: paid ? 0 : 1032,
            result_desc: paid
              ? 'The service request is processed successfully.'
              : 'Request cancelled by user',
            transaction_date: bookedAt,
          },
        });
        log.push({
          user_id: student.user_id,
          action: paid ? 'PAYMENT_COMPLETED' : 'PAYMENT_FAILED',
          target_type: 'booking',
          target_id: booking.booking_id,
          timestamp: new Date(bookedAt.getTime() + 60_000),
          ...(paid && { details: { mpesa_receipt: `SEED${ref}`, amount: spec.price } }),
        });
      }
      if (isCancelled) {
        log.push({
          user_id: student.user_id,
          action: 'BOOKING_CANCELLED',
          target_type: 'booking',
          target_id: booking.booking_id,
          timestamp: new Date(bookedAt.getTime() + 5 * 60_000),
        });
      }
      if (isCheckedIn) {
        log.push({
          user_id: organizer.user_id,
          action: 'CHECK_IN',
          target_type: 'booking',
          target_id: booking.booking_id,
          timestamp: booking.checked_in_at,
        });
      }
    }

    await prisma.auditLog.createMany({
      data: log.map((entry) => ({ target_type: 'event', target_id: event.event_id, ...entry })),
    });
    created += 1;
  }

  console.log(
    `Extra demo events: ${created} created, ${EXTRA_EVENTS.length - created} already there.`,
  );
}

async function main() {
  const categories = await seedCategories();
  const venues = await seedVenues();
  const users = await seedUsers();
  await seedEventsAndBookings({ categories, venues, users });
  await seedExtraEvents({ categories, venues, users });

  console.log('Seed complete. Demo accounts (password: %s):', DEMO_PASSWORD);
  for (const email of Object.keys(users)) console.log(`  - ${email}`);
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
