import { Link } from 'react-router-dom';
import api, { metaOf, unwrap } from '../../lib/api';
import { dateTime, percent, moneyPlain, titleCase } from '../../lib/format';
import { useLoad } from '../../lib/useAsync';
import { useAuth } from '../../context/AuthContext';
import { Card, ErrorState, PageHeader, Spinner, Stat } from '../../components/ui';

export default function AdminDashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useLoad(async () => {
    const [pending, users, report, logs] = await Promise.all([
      api.get('/admin/events', { params: { status: 'pending', pageSize: 1 } }),
      api.get('/admin/users', { params: { pageSize: 1 } }),
      api.get('/reports/attendance'),
      api.get('/audit-logs', { params: { pageSize: 6 } }),
    ]);
    return { pending: metaOf(pending).total, users: metaOf(users).total, totals: unwrap(report).totals, logs: unwrap(logs).logs };
  }, []);

  if (loading) return <Spinner label="Loading the dashboard" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader title={`Hello, ${user.name.split(' ')[0]}`} subtitle="Here’s what needs you today." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/admin/approvals"><Stat label="Waiting for approval" value={data.pending} tone={data.pending ? 'warn' : undefined} sub={data.pending ? 'Open the queue' : 'All caught up'} /></Link>
        <Link to="/admin/users"><Stat label="Users" value={data.users} /></Link>
        <Stat label="Bookings" value={data.totals.bookings} sub={`${percent(data.totals.attendance_rate)} attended`} />
        <Stat label="Revenue" value={moneyPlain(data.totals.revenue)} sub="Completed M-Pesa payments" />
      </div>
      <Card>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Recent activity</h2><Link to="/admin/audit" className="text-sm font-semibold text-jacaranda-600 hover:underline">See the audit log</Link></div>
        {data.logs.length === 0 ? <p className="text-ink-500">Nothing has happened yet.</p> : (
          <ul className="divide-y divide-ink-100">
            {data.logs.map((l) => (
              <li key={l.log_id} className="flex flex-wrap justify-between gap-2 py-2.5 text-sm">
                <span><strong>{l.user?.name || 'System'}</strong> · {titleCase(l.action.toLowerCase())}{l.target_type ? ` (${l.target_type} ${l.target_id ?? ''})` : ''}</span>
                <time className="text-ink-500">{dateTime(l.timestamp)}</time>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
