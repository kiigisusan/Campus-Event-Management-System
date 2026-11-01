import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api, { unwrap } from '../../lib/api';
import { moneyPlain } from '../../lib/format';
import { useLoad } from '../../lib/useAsync';
import { Card, EmptyState, ErrorState, PageHeader, Spinner, Stat } from '../../components/ui';

const STATUS_COLOR = { draft: '#6B7BA8', pending: '#FBBF24', approved: '#34D399', rejected: '#FF6B5E', cancelled: '#4B5B80' };

export default function Analytics() {
  const { data, loading, error, reload } = useLoad(async () => unwrap(await api.get('/events/mine', { params: { pageSize: 100 } })).events, []);
  if (loading) return <Spinner label="Crunching your numbers" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data.length) return <EmptyState title="No events to analyse yet" text="Create and publish an event, and your numbers will show up here." />;

  const live = data.filter((e) => e.status === 'approved');
  const rows = live.map((e) => ({
    name: e.title.length > 18 ? `${e.title.slice(0, 17)}…` : e.title,
    Booked: e.capacity - e.spots_remaining, Open: e.spots_remaining, revenue: (e.capacity - e.spots_remaining) * e.price,
  }));
  const seats = rows.reduce((s, r) => s + r.Booked, 0);
  const capacity = live.reduce((s, e) => s + e.capacity, 0);
  const statusData = Object.entries(data.reduce((m, e) => ({ ...m, [e.status]: (m[e.status] || 0) + 1 }), {})).map(([name, value]) => ({ name, value }));

  return (
    <div>
      <PageHeader title="Analytics" subtitle="How your events are filling up." />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Live events" value={live.length} sub={`${data.length} in total`} />
        <Stat label="Seats taken or held" value={seats} sub={`of ${capacity} available`} />
        <Stat label="Average fill" value={capacity ? `${Math.round((seats / capacity) * 100)}%` : '0%'} />
        <Stat label="Estimated sales" value={moneyPlain(rows.reduce((s, r) => s + r.revenue, 0))} sub="Seats × price, before refunds" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-3 text-lg font-bold">Seats per live event</h2>
          {rows.length === 0 ? <p className="text-ink-500">None of your events are live yet.</p> : (
            <div className="h-72"><ResponsiveContainer>
              <BarChart data={rows}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} /><Tooltip /><Legend />
                <Bar dataKey="Booked" stackId="a" fill="#4D8DFF" /><Bar dataKey="Open" stackId="a" fill="#0E2A66" /></BarChart>
            </ResponsiveContainer></div>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-bold">Events by status</h2>
          <div className="h-72"><ResponsiveContainer>
            <PieChart><Pie data={statusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
              {statusData.map((s) => <Cell key={s.name} fill={STATUS_COLOR[s.name]} />)}</Pie><Tooltip /><Legend /></PieChart>
          </ResponsiveContainer></div>
        </Card>
      </div>
    </div>
  );
}