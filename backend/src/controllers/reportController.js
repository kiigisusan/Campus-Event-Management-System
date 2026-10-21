/**
 * HTTP layer for /reports: each report is available as JSON (for the Reports
 * page and its charts) and as a PDF download with the same filters.
 */
import { prisma } from '../config/prisma.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { recordAudit } from '../services/auditService.js';
import { writeReportPdf } from '../services/pdf/reportPdf.js';
import * as reportService from '../services/reportService.js';
import { sendSuccess } from '../utils/response.js';

const kes = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
});
const formatKes = (amount) => kes.format(amount);
const formatPercent = (value) => (value === null ? '-' : `${value}%`);
const formatInt = (value) => value.toLocaleString('en-KE');

/** Column layouts for the PDF version of each report. */
const REPORTS = {
  attendance: {
    title: 'Attendance Report',
    build: reportService.attendanceReport,
    columns: [
      { label: 'Date', value: (r) => `${r.date} ${r.time}`, width: 1.3 },
      { label: 'Event', value: (r) => r.title, width: 3 },
      { label: 'Category', value: (r) => r.category, width: 1.4 },
      { label: 'Organizer', value: (r) => r.organizer, width: 2 },
      { label: 'Capacity', value: (r) => formatInt(r.capacity), width: 0.9, align: 'right' },
      { label: 'Bookings', value: (r) => formatInt(r.bookings), width: 0.9, align: 'right' },
      { label: 'Checked in', value: (r) => formatInt(r.checked_in), width: 0.9, align: 'right' },
      {
        label: 'Attendance',
        value: (r) => formatPercent(r.attendance_rate),
        width: 1,
        align: 'right',
      },
      { label: 'Revenue', value: (r) => formatKes(r.revenue), width: 1.2, align: 'right' },
    ],
    summary: (t) => [
      ['Events', formatInt(t.events)],
      ['Bookings', formatInt(t.bookings)],
      ['Checked in', formatInt(t.checked_in)],
      ['Attendance rate', formatPercent(t.attendance_rate)],
      ['Revenue', formatKes(t.revenue)],
    ],
  },
  categories: {
    title: 'Popular Categories Report',
    build: reportService.categoryReport,
    columns: [
      { label: 'Category', value: (r) => r.category, width: 2.5 },
      { label: 'Events', value: (r) => formatInt(r.events), width: 1, align: 'right' },
      { label: 'Bookings', value: (r) => formatInt(r.bookings), width: 1, align: 'right' },
      {
        label: 'Share of bookings',
        value: (r) => formatPercent(r.share_of_bookings),
        width: 1.4,
        align: 'right',
      },
      { label: 'Checked in', value: (r) => formatInt(r.checked_in), width: 1, align: 'right' },
      {
        label: 'Attendance',
        value: (r) => formatPercent(r.attendance_rate),
        width: 1.1,
        align: 'right',
      },
      { label: 'Revenue', value: (r) => formatKes(r.revenue), width: 1.3, align: 'right' },
    ],
    summary: (t) => [
      ['Categories', formatInt(t.categories)],
      ['Bookings', formatInt(t.bookings)],
      ['Attendance rate', formatPercent(t.attendance_rate)],
      ['Revenue', formatKes(t.revenue)],
    ],
  },
  organizers: {
    title: 'Organizer Activity Report',
    build: reportService.organizerReport,
    columns: [
      { label: 'Organizer', value: (r) => r.organizer, width: 2.4 },
      { label: 'Contact', value: (r) => r.email, width: 2.2 },
      { label: 'Events', value: (r) => formatInt(r.events), width: 0.8, align: 'right' },
      { label: 'Approved', value: (r) => formatInt(r.approved), width: 0.9, align: 'right' },
      { label: 'Pending', value: (r) => formatInt(r.pending), width: 0.8, align: 'right' },
      { label: 'Rejected', value: (r) => formatInt(r.rejected), width: 0.8, align: 'right' },
      { label: 'Cancelled', value: (r) => formatInt(r.cancelled), width: 0.9, align: 'right' },
      { label: 'Bookings', value: (r) => formatInt(r.bookings), width: 0.9, align: 'right' },
      { label: 'Checked in', value: (r) => formatInt(r.checked_in), width: 0.9, align: 'right' },
      { label: 'Revenue', value: (r) => formatKes(r.revenue), width: 1.2, align: 'right' },
    ],
    summary: (t) => [
      ['Organizers', formatInt(t.organizers)],
      ['Events', formatInt(t.events)],
      ['Bookings', formatInt(t.bookings)],
      ['Revenue', formatKes(t.revenue)],
    ],
  },
};

const SORT_LABELS = {
  date: 'date',
  title: 'title',
  name: 'name',
  events: 'events',
  bookings: 'bookings',
  checked_in: 'checked in',
  attendance_rate: 'attendance rate',
  revenue: 'revenue',
};

/** The filters as readable label/value pairs for the PDF header. */
async function describeFilters(filters) {
  const pairs = [];
  if (filters.from) pairs.push(['From', filters.from]);
  if (filters.to) pairs.push(['To', filters.to]);
  if (filters.category_id) {
    const category = await prisma.category.findUnique({
      where: { category_id: filters.category_id },
    });
    pairs.push(['Category', category?.name ?? `#${filters.category_id}`]);
  }
  if (filters.group_by) pairs.push(['Trend by', filters.group_by]);
  pairs.push([
    'Sorted by',
    `${SORT_LABELS[filters.sort]} (${filters.order === 'asc' ? 'ascending' : 'descending'})`,
  ]);
  return pairs;
}

/** GET /reports/:type - JSON for the Reports page. */
export const reportJson = (type) => async (req, res) => {
  const report = await REPORTS[type].build(req.validated.query);
  sendSuccess(res, { report: type, filters: req.validated.query, ...report });
};

/** GET /reports/:type/pdf - the same report as a downloadable PDF. */
export const reportPdf = (type) => async (req, res) => {
  const definition = REPORTS[type];
  const filters = req.validated.query;
  const report = await definition.build(filters);

  await recordAudit({
    userId: req.user.user_id,
    action: AUDIT_ACTIONS.EXPORT_REPORT,
    targetType: 'report',
    details: { report: type, filters, rows: report.rows.length },
    ipAddress: req.ip,
  });

  const today = new Date().toISOString().slice(0, 10);
  res.type('pdf');
  res.set('Content-Disposition', `attachment; filename="cems-${type}-report-${today}.pdf"`);
  writeReportPdf(res, {
    title: definition.title,
    generatedBy: req.user.name,
    filters: await describeFilters(filters),
    summary: definition.summary(report.totals),
    columns: definition.columns,
    rows: report.rows,
  });
};
