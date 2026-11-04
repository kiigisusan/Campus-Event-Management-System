import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, Pencil, Send, XCircle } from 'lucide-react';
import api, { errorMessage, metaOf, unwrap } from '../../lib/api';
import { dateLong, money, timeShort } from '../../lib/format';
import { useLoad, useSubmit } from '../../lib/useAsync';
import { useToast } from '../../context/ToastContext';
import {
  Button, EmptyState, ErrorState, Modal, PageHeader, Pagination, Select, Spinner, StatusBadge, Table, Td, Textarea,
} from '../../components/ui';

export default function OrganizerDashboard() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [reason, setReason] = useState('');
  const { data, loading, error, reload } = useLoad(async () => {
    const res = await api.get('/events/mine', { params: { status: status || undefined, page, pageSize: 10 } });
    return { list: unwrap(res).events, meta: metaOf(res) };
  }, [status, page]);

  const [submitting, submitEvent] = useSubmit(async (event) => {
    try {
      await api.patch(`/events/${event.event_id}/submit`);
      toast.success(`“${event.title}” was sent for approval.`);
      reload();
    } catch (e) { toast.error(errorMessage(e)); }
  });

  const [cancelling, cancelEvent] = useSubmit(async () => {
    try {
      const res = unwrap(await api.patch(`/events/${cancelTarget.event_id}/cancel`, reason.trim() ? { reason: reason.trim() } : {}));
      toast.success(`Event cancelled. ${res.notified} student${res.notified === 1 ? '' : 's'} notified.`);
      setCancelTarget(null); setReason('');
      reload();
    } catch (e) { toast.error(errorMessage(e)); setCancelTarget(null); }
  });

  return (
    <div>
      <PageHeader title="My events" subtitle="Drafts, events waiting for approval, and events that are live."
        actions={<>
          <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>{['draft', 'pending', 'approved', 'rejected', 'cancelled'].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </Select>
          <Link to="/organizer/events/new" className="inline-flex items-center gap-2 self-end rounded-lg bg-jacaranda-600 px-4 py-2.5 text-sm font-semibold text-ink-50 hover:bg-jacaranda-700"><CalendarPlus className="h-4 w-4" aria-hidden />New event</Link>
        </>} />

      {loading && !data ? <Spinner label="Loading your events" /> : error ? <ErrorState message={error} onRetry={reload} /> :
        data.list.length === 0 ? (
          <EmptyState title={status ? 'No events with that status' : 'You haven’t created an event yet'} text="Create an event, submit it, and an admin will review it."
            action={<Link to="/organizer/events/new" className="rounded-lg bg-jacaranda-600 px-4 py-2.5 text-sm font-semibold text-ink-50">Create your first event</Link>} />
        ) : (
          <>
            <Table columns={['Event', 'When', 'Price', 'Booked', 'Status', 'Actions']}>
              {data.list.map((e) => (
                <tr key={e.event_id}>
                  <Td><Link to={`/events/${e.event_id}`} className="font-semibold hover:text-jacaranda-600">{e.title}</Link>
                    {e.status === 'rejected' && e.rejection_reason && <p className="mt-0.5 max-w-xs text-xs font-medium text-rose-600">Rejected: {e.rejection_reason}</p>}</Td>
                  <Td className="whitespace-nowrap text-ink-500">{dateLong(e.event_date)}<br />{timeShort(e.event_time)}</Td>
                  <Td>{money(e.price)}</Td>
                  <Td className="tabular-nums">{e.capacity - e.spots_remaining} / {e.capacity}</Td>
                  <Td><StatusBadge status={e.status} /></Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {['draft', 'rejected', 'pending', 'approved'].includes(e.status) && (
                        <Link to={`/organizer/events/${e.event_id}/edit`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-ink-700 hover:bg-ink-100"><Pencil className="h-3.5 w-3.5" aria-hidden />Edit</Link>)}
                      {e.status === 'draft' && <Button size="sm" variant="ghost" icon={Send} disabled={submitting} onClick={() => submitEvent(e)}>Submit</Button>}
                      {['pending', 'approved'].includes(e.status) && <Button size="sm" variant="ghost" icon={XCircle} onClick={() => setCancelTarget(e)}>Cancel</Button>}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination meta={data.meta} onPage={setPage} />
          </>
        )}

      <Modal open={Boolean(cancelTarget)} onClose={() => setCancelTarget(null)} title="Cancel this event?"
        footer={<><Button variant="secondary" onClick={() => setCancelTarget(null)} disabled={cancelling}>Keep it</Button><Button variant="danger" loading={cancelling} onClick={cancelEvent}>Cancel event</Button></>}>
        <p className="mb-3 text-ink-700">Everyone with a booking for <strong>{cancelTarget?.title}</strong> will get an email.</p>
        <Textarea label="Reason (optional)" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} help="Students will see this in the email." />
      </Modal>
    </div>
  );
}