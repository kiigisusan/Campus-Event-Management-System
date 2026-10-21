/**
 * Admin reports (FR5): attendance trends, popular categories and organizer
 * activity, with date range, category and sort filters.
 *
 * These are aggregate queries (GROUP BY over events, bookings and payments),
 * written as Prisma tagged SQL:
 *  - every filter VALUE is a bound parameter (`${value}` inside Prisma.sql),
 *  - every ORDER BY column comes from a fixed whitelist below,
 * so no user input is ever concatenated into SQL.
 *
 * Counting rules, used consistently in every report:
 *  - "bookings"   = bookings that hold a seat and are paid: confirmed or checked_in
 *  - "checked in" = bookings with status checked_in
 *  - "revenue"    = completed M-Pesa payments for those bookings
 *  - "attendance rate" = checked in / bookings
 *  Only approved events count, except in the organizer report, which also
 *  shows how many events were pending, rejected or cancelled.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';

const { sql, join, raw } = Prisma;

/** Shared SELECT expressions; they rely on the aliases b (bookings) and p (payments). */
const BOOKED = sql`COUNT(CASE WHEN b.status IN ('confirmed', 'checked_in') THEN 1 END)`;
const CHECKED_IN = sql`COUNT(CASE WHEN b.status = 'checked_in' THEN 1 END)`;
const REVENUE = sql`COALESCE(SUM(CASE WHEN p.status = 'completed' AND b.status IN ('confirmed', 'checked_in') THEN p.amount END), 0)`;
const ATTENDANCE_RATE = sql`(${CHECKED_IN} / NULLIF(${BOOKED}, 0))`;

const direction = (order) => raw(order === 'asc' ? 'ASC' : 'DESC');

/** Conditions on the events table (alias e) from the date range and category filters. */
function eventConditions({ from, to, category_id: categoryId }, { includeCategory = true } = {}) {
  const conditions = [];
  if (from) conditions.push(sql`e.event_date >= ${from}`);
  if (to) conditions.push(sql`e.event_date <= ${to}`);
  if (includeCategory && categoryId) conditions.push(sql`e.category_id = ${categoryId}`);
  return conditions;
}

const andAll = (conditions) => (conditions.length ? join(conditions, ' AND ') : sql`1 = 1`);

/** MySQL returns COUNT as BigInt and SUM as Decimal; reports use plain numbers. */
const num = (value) => (value === null || value === undefined ? 0 : Number(value));
const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
const isoDay = (date) => date.toISOString().slice(0, 10);
const hhmm = (time) => time.toISOString().slice(11, 16);

function totalsOf(rows) {
  const totals = rows.reduce(
    (sum, row) => ({
      bookings: sum.bookings + row.bookings,
      checked_in: sum.checked_in + row.checked_in,
      revenue: sum.revenue + row.revenue,
    }),
    { bookings: 0, checked_in: 0, revenue: 0 },
  );
  return { ...totals, attendance_rate: percent(totals.checked_in, totals.bookings) };
}

// --- Attendance -------------------------------------------------------------

const ATTENDANCE_SORT = {
  date: sql`e.event_date`,
  title: sql`e.title`,
  bookings: BOOKED,
  checked_in: CHECKED_IN,
  attendance_rate: ATTENDANCE_RATE,
  revenue: REVENUE,
};

const PERIOD = {
  day: sql`DATE_FORMAT(e.event_date, '%Y-%m-%d')`,
  week: sql`DATE_FORMAT(e.event_date, '%x-W%v')`, // ISO week, e.g. 2026-W43
  month: sql`DATE_FORMAT(e.event_date, '%Y-%m')`,
};

/**
 * Per-event attendance, plus a trend over time grouped by day, week or month.
 * @param {{ from?: string, to?: string, category_id?: number, sort: string, order: string, group_by: string }} filters
 */
export async function attendanceReport(filters) {
  const where = andAll([sql`e.status = 'approved'`, ...eventConditions(filters)]);
  const joins = sql`
    FROM events e
    JOIN categories c ON c.category_id = e.category_id
    JOIN users u ON u.user_id = e.organizer_id
    LEFT JOIN bookings b ON b.event_id = e.event_id
    LEFT JOIN payments p ON p.booking_id = b.booking_id`;

  const [eventRows, trendRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT e.event_id, e.title, e.event_date, e.event_time, e.capacity,
             c.name AS category, COALESCE(u.org_name, u.name) AS organizer,
             ${BOOKED} AS booked, ${CHECKED_IN} AS checked_in, ${REVENUE} AS revenue
      ${joins}
      WHERE ${where}
      GROUP BY e.event_id, e.title, e.event_date, e.event_time, e.capacity, c.name, u.org_name, u.name
      ORDER BY ${ATTENDANCE_SORT[filters.sort]} ${direction(filters.order)}, e.event_id`,
    prisma.$queryRaw`
      SELECT ${PERIOD[filters.group_by]} AS period,
             COUNT(DISTINCT e.event_id) AS events,
             ${BOOKED} AS booked, ${CHECKED_IN} AS checked_in
      ${joins}
      WHERE ${where}
      GROUP BY period
      ORDER BY period`,
  ]);

  const rows = eventRows.map((row) => {
    const bookings = num(row.booked);
    const checkedIn = num(row.checked_in);
    return {
      event_id: row.event_id,
      title: row.title,
      date: isoDay(row.event_date),
      time: hhmm(row.event_time),
      category: row.category,
      organizer: row.organizer,
      capacity: row.capacity,
      bookings,
      checked_in: checkedIn,
      attendance_rate: percent(checkedIn, bookings),
      fill_rate: percent(bookings, row.capacity),
      revenue: num(row.revenue),
    };
  });

  const trend = trendRows.map((row) => {
    const bookings = num(row.booked);
    const checkedIn = num(row.checked_in);
    return {
      period: row.period,
      events: num(row.events),
      bookings,
      checked_in: checkedIn,
      attendance_rate: percent(checkedIn, bookings),
    };
  });

  return { rows, trend, totals: { events: rows.length, ...totalsOf(rows) } };
}

// --- Popular categories ---------------------------------------------------------

const CATEGORY_SORT = {
  name: sql`c.name`,
  events: sql`COUNT(DISTINCT e.event_id)`,
  bookings: BOOKED,
  checked_in: CHECKED_IN,
  attendance_rate: ATTENDANCE_RATE,
  revenue: REVENUE,
};

/**
 * Events, bookings and revenue per category. Categories with no events in
 * the range still appear (with zeros) so the chart shows every category.
 * @param {{ from?: string, to?: string, category_id?: number, sort: string, order: string }} filters
 */
export async function categoryReport(filters) {
  // Event filters go in the JOIN (not WHERE) so empty categories are kept.
  const eventJoin = andAll([
    sql`e.category_id = c.category_id`,
    sql`e.status = 'approved'`,
    ...eventConditions(filters, { includeCategory: false }),
  ]);
  const categoryWhere = filters.category_id
    ? sql`c.category_id = ${filters.category_id}`
    : sql`1 = 1`;

  const result = await prisma.$queryRaw`
    SELECT c.category_id, c.name,
           COUNT(DISTINCT e.event_id) AS events,
           ${BOOKED} AS booked, ${CHECKED_IN} AS checked_in, ${REVENUE} AS revenue
    FROM categories c
    LEFT JOIN events e ON ${eventJoin}
    LEFT JOIN bookings b ON b.event_id = e.event_id
    LEFT JOIN payments p ON p.booking_id = b.booking_id
    WHERE ${categoryWhere}
    GROUP BY c.category_id, c.name
    ORDER BY ${CATEGORY_SORT[filters.sort]} ${direction(filters.order)}, c.name`;

  const rows = result.map((row) => {
    const bookings = num(row.booked);
    const checkedIn = num(row.checked_in);
    return {
      category_id: row.category_id,
      category: row.name,
      events: num(row.events),
      bookings,
      checked_in: checkedIn,
      attendance_rate: percent(checkedIn, bookings),
      revenue: num(row.revenue),
    };
  });

  const totals = totalsOf(rows);
  for (const row of rows) row.share_of_bookings = percent(row.bookings, totals.bookings);

  return { rows, totals: { categories: rows.length, ...totals } };
}

// --- Organizer activity ---------------------------------------------------------

const ORGANIZER_SORT = {
  name: sql`COALESCE(u.org_name, u.name)`,
  events: sql`COUNT(DISTINCT e.event_id)`,
  bookings: BOOKED,
  checked_in: CHECKED_IN,
  revenue: REVENUE,
};

const countEventsWithStatus = (status) =>
  sql`COUNT(DISTINCT CASE WHEN e.status = ${status} THEN e.event_id END)`;

/**
 * Per organizer: events by status, bookings, check-ins and revenue.
 * @param {{ from?: string, to?: string, category_id?: number, sort: string, order: string }} filters
 */
export async function organizerReport(filters) {
  const eventJoin = andAll([sql`e.organizer_id = u.user_id`, ...eventConditions(filters)]);

  const result = await prisma.$queryRaw`
    SELECT u.user_id, u.name, u.org_name, u.email,
           COUNT(DISTINCT e.event_id) AS events,
           ${countEventsWithStatus('approved')} AS approved,
           ${countEventsWithStatus('pending')} AS pending,
           ${countEventsWithStatus('rejected')} AS rejected,
           ${countEventsWithStatus('cancelled')} AS cancelled,
           ${BOOKED} AS booked, ${CHECKED_IN} AS checked_in, ${REVENUE} AS revenue
    FROM users u
    LEFT JOIN events e ON ${eventJoin}
    LEFT JOIN bookings b ON b.event_id = e.event_id
    LEFT JOIN payments p ON p.booking_id = b.booking_id
    WHERE u.role = 'organizer'
    GROUP BY u.user_id, u.name, u.org_name, u.email
    ORDER BY ${ORGANIZER_SORT[filters.sort]} ${direction(filters.order)}, u.user_id`;

  const rows = result.map((row) => {
    const bookings = num(row.booked);
    const checkedIn = num(row.checked_in);
    return {
      user_id: row.user_id,
      organizer: row.org_name ?? row.name,
      contact_name: row.name,
      email: row.email,
      events: num(row.events),
      approved: num(row.approved),
      pending: num(row.pending),
      rejected: num(row.rejected),
      cancelled: num(row.cancelled),
      bookings,
      checked_in: checkedIn,
      attendance_rate: percent(checkedIn, bookings),
      revenue: num(row.revenue),
    };
  });

  return {
    rows,
    totals: {
      organizers: rows.length,
      events: rows.reduce((sum, row) => sum + row.events, 0),
      ...totalsOf(rows),
    },
  };
}
