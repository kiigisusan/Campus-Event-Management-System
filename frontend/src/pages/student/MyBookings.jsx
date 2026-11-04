import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ticket } from 'lucide-react';
import api, { errorMessage, metaOf, unwrap } from '../../lib/api';
import { dateLong, money, timeShort } from '../../lib/format';
import { useLoad, useSubmit } from '../../lib/useAsync';
import { useToast } from '../../context/ToastContext';
import { Button, ConfirmModal, EmptyState, ErrorState, PageHeader, Pagination, Select, Spinner, StatusBadge } from '../../components/ui';

export default function MyBookings() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState(null); // booking being cancelled
  const { data, loading, error, reload } = useLoad(async () => {
    const res = await api.get('/bookings/me', { params: { status: status || undefined, page, pageSize: 10 } });
    return { list: unwrap(res).bookings, meta: metaOf(res) };
  }, [status, page]);

  const [cancelling, cancel] = useSubmit(async () => {
    try {
      const res = unwrap(await api.patch(`/bookings/${target.booking_id}/cancel`));
      toast.success(res.message);
      setTarget(null);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
      setTarget(null);
    }
  });

  return (
    <div>
      <PageHeader title="My bookings" subtitle="Your tickets, payments and past events."
        actions={<Select label="Show" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All bookings</option><option value="confirmed">Confirmed</option><option value="pending">Awaiting payment</option>
          <option value="checked_in">Checked in</option><option value="cancelled">Cancelled</option>
        </Select>} />

      {loading && !data ? <Spinner label="Loading your bookings" /> : error ? <ErrorState message={error} onRetry={reload} /> :
        data.list.length === 0 ? (
          <EmptyState icon={Ticket} title={status ? 'No bookings with that status' : 'You haven’t booked anything yet'}
            text="Find an event you like and book your spot." action={<Link to="/" className="rounded-lg bg-jacaranda-600 px-4 py-2.5 text-sm font-semibold text-ink-50">Browse events</Link>} />
        ) : (
          <>
            <ul className="space-y-3">
              {data.list.map((b) => {
                const canCancel = ['pending', 'confirmed'].includes(b.status);
                return (
                  <li key={b.booking_id} className="card flex flex-wrap items-center gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-lg font-bold">{b.event.title}</h2><StatusBadge status={b.status} />
                      </div>
                      <p className="mt-0.5 text-sm text-ink-500">{dateLong(b.event.event_date)} · {timeShort(b.event.event_time)} · {b.event.venue?.name} · {money(b.event.price)}</p>
                    </div>
                    <div className="flex gap-2">
                      {b.status === 'pending' && <Link to={`/bookings/${b.booking_id}`} className="rounded-lg bg-jacaranda-600 px-3 py-1.5 text-sm font-semibold text-ink-50">Pay now</Link>}
                      {['confirmed', 'checked_in'].includes(b.status) && <Link to={`/bookings/${b.booking_id}`} className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-semibold hover:bg-ink-100">View ticket</Link>}
                      {canCancel && <Button variant="ghost" size="sm" onClick={() => setTarget(b)}>Cancel</Button>}
                    </div>
                  </li>
                );
              })}
            </ul>
            <Pagination meta={data.meta} onPage={setPage} />
          </>
        )}

      <ConfirmModal open={Boolean(target)} onClose={() => setTarget(null)} danger loading={cancelling} onConfirm={cancel}
        title="Cancel this booking?" confirmLabel="Cancel booking"
        text={target ? `${target.event.title} on ${dateLong(target.event.event_date)}. Your seat will be released.${Number(target.event.price) > 0 && target.status === 'confirmed' ? ' The organizer will contact you about your M-Pesa refund.' : ''}` : ''} />
    </div>
  );
}