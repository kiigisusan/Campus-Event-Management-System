import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api, { downloadFile, errorMessage, unwrap } from '../../lib/api';
import { moneyPlain, percent } from '../../lib/format';
import { useLoad, useSubmit } from '../../lib/useAsync';
import { useToast } from '../../context/ToastContext';
import { Button, Card, EmptyState, ErrorState, InlineError, Input, PageHeader, Select, Spinner, Stat, Table, Td } from '../../components/ui';

const COLORS = ['#4D8DFF', '#2DE2E6', '#34D399', '#FBBF24', '#FF6B5E', '#8B5CF6', '#6B7BA8'];

const TABS = {
  attendance: {
    label: 'Attendance',
    sorts: [['date', 'Date'], ['title', 'Title'], ['bookings', 'Bookings'], ['checked_in', 'Checked in'], ['attendance_rate', 'Attendance rate'], ['revenue', 'Revenue']],
    columns: ['Event', 'Date', 'Category', 'Bookings', 'Checked in', 'Attendance', 'Revenue'],
    row: (r) => [r.title, r.date, r.category, r.bookings, r.checked_in, percent(r.attendance_rate), moneyPlain(r.revenue)],
  },
  categories: {
    label: 'Popular categories',
    sorts: [['bookings', 'Bookings'], ['name', 'Name'], ['events', 'Events'], ['checked_in', 'Checked in'], ['attendance_rate', 'Attendance rate'], ['revenue', 'Revenue']],
    columns: ['Category', 'Events', 'Bookings', 'Share', 'Checked in', 'Revenue'],
    row: (r) => [r.category, r.events, r.bookings, percent(r.share_of_bookings), r.checked_in, moneyPlain(r.revenue)],
  },
  organizers: {
    label: 'Organizers',
    sorts: [['events', 'Events'], ['name', 'Name'], ['bookings', 'Bookings'], ['checked_in', 'Checked in'], ['revenue', 'Revenue']],
    columns: ['Organizer', 'Events', 'Approved', 'Pending', 'Rejected', 'Bookings', 'Revenue'],
    row: (r) => [r.organizer, r.events, r.approved, r.pending, r.rejected, r.bookings, moneyPlain(r.revenue)],
  },
};

export default function Reports() {
  const toast = useToast();
  const [tab, setTab] = useState('attendance');
  const [f, setF] = useState({ from: '', to: '', category_id: '', sort: '', order: 'desc', group_by: 'month' });
  const cfg = TABS[tab];
  const sort = f.sort && cfg.sorts.some(([k]) => k === f.sort) ? f.sort : cfg.sorts[0][0];
  const dateError = f.from && f.to && f.from > f.to ? 'The start date must be on or before the end date' : '';

  const params = useMemo(() => ({
    from: f.from || undefined, to: f.to || undefined, category_id: f.category_id || undefined, sort, order: f.order,
    ...(tab === 'attendance' ? { group_by: f.group_by } : {}),
  }), [f, sort, tab]);

  const categories = useLoad(async () => unwrap(await api.get('/categories')).categories, []);
  const report = useLoad(async () => (dateError ? null : unwrap(await api.get(`/reports/${tab}`, { params }))), [tab, params, dateError]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const [exporting, exportPdf] = useSubmit(async () => {
    try { await downloadFile(`/reports/${tab}/pdf`, params, `${tab}-report.pdf`); toast.success('PDF downloaded.'); }
    catch (e) { toast.error(errorMessage(e, 'We couldn’t create the PDF.')); }
  });

  const data = report.data;
  return (
    <div>
      <PageHeader title="Reports" subtitle="Attendance, popular categories and organizer activity. Only approved events are counted."
        actions={<Button icon={Download} loading={exporting} disabled={Boolean(dateError)} onClick={exportPdf}>Export PDF</Button>} />

      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-ink-100">
        {Object.entries(TABS).map(([k, t]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === k ? 'border-jacaranda-600 text-jacaranda-600' : 'border-transparent text-ink-500 hover:text-ink-900'}`}>{t.label}</button>
        ))}
      </div>

      <form onSubmit={(e) => e.preventDefault()} className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <Input label="From" type="date" value={f.from} onChange={set('from')} hint="Filters by the event’s date." />
        <Input label="To" type="date" value={f.to} onChange={set('to')} error={dateError} />
        <Select label="Category" value={f.category_id} onChange={set('category_id')}><option value="">All</option>{categories.data?.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}</Select>
        <Select label="Sort by" value={sort} onChange={set('sort')}>{cfg.sorts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        <Select label="Order" value={f.order} onChange={set('order')}><option value="desc">High to low</option><option value="asc">Low to high</option></Select>
        {tab === 'attendance' && <Select label="Trend by" value={f.group_by} onChange={set('group_by')}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></Select>}
      </form>

      {dateError ? <InlineError>{dateError}</InlineError> : report.loading && !data ? <Spinner label="Building the report" /> : report.error ? <ErrorState message={report.error} onRetry={report.reload} /> :
        !data || data.rows.length === 0 ? <EmptyState title="No data for these filters" text="Try a wider date range or a different category." /> : (
          <div className={report.loading ? 'opacity-60 transition-opacity' : ''}>
            <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Bookings" value={data.totals.bookings} />
              <Stat label="Checked in" value={data.totals.checked_in} sub={`${percent(data.totals.attendance_rate)} attendance`} />
              <Stat label="Revenue" value={moneyPlain(data.totals.revenue)} />
              <Stat label={tab === 'attendance' ? 'Events' : tab === 'categories' ? 'Categories' : 'Organizers'} value={data.totals.events ?? data.totals.categories ?? data.totals.organizers} />
            </div>

            <Card className="mb-5">
              <div className="h-72"><ResponsiveContainer>
                {tab === 'attendance' ? (
                  <LineChart data={data.trend}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="period" /><YAxis allowDecimals={false} /><Tooltip /><Legend />
                    <Line dataKey="bookings" name="Bookings" stroke="#4D8DFF" strokeWidth={2} /><Line dataKey="checked_in" name="Checked in" stroke="#34D399" strokeWidth={2} /></LineChart>
                ) : tab === 'categories' ? (
                  <PieChart><Pie data={data.rows} dataKey="bookings" nameKey="category" innerRadius={55} outerRadius={100} paddingAngle={2}>{data.rows.map((r, i) => <Cell key={r.category_id} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart>
                ) : (
                  <BarChart data={data.rows}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="organizer" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} /><Tooltip /><Legend />
                    <Bar dataKey="bookings" name="Bookings" fill="#4D8DFF" /><Bar dataKey="checked_in" name="Checked in" fill="#34D399" /></BarChart>
                )}
              </ResponsiveContainer></div>
            </Card>

            <Table columns={cfg.columns}>
              {data.rows.map((r, i) => <tr key={r.event_id ?? r.category_id ?? r.user_id ?? i}>{cfg.row(r).map((c, j) => <Td key={j} className={j === 0 ? 'font-semibold' : 'tabular-nums'}>{c}</Td>)}</tr>)}
            </Table>
          </div>
        )}
    </div>
  );
}
