import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import api, { errorMessage, metaOf, unwrap } from '../../lib/api';
import { dateLong, money, timeShort } from '../../lib/format';
import { useLoad, useSubmit } from '../../lib/useAsync';
import { useToast } from '../../context/ToastContext';
import { Button, EmptyState, ErrorState, Modal, PageHeader, Pagination, Select, Spinner, StatusBadge, Table, Td, Textarea } from '../../components/ui';

export default function Approvals() {
  const toast = useToast();
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const { data, loading, error, reload } = useLoad(async () => {
    const res = await api.get('/admin/events', { params: { status, page, pageSize: 10 } });
    return { list: unwrap(res).events, meta: metaOf(res) };
  }, [status, page]);

  const [approving, approve] = useSubmit(async (e) => {
    try { await api.patch(`/admin/events/${e.event_id}/approve`); toast.success(`“${e.title}” is now live.`); reload(); }
    catch (err) { toast.error(errorMessage(err)); }
  });

  const [rejectingBusy, reject] = useSubmit(async () => {
    if (reason.trim().length < 5) return setReasonError('Please give a reason (at least 5 characters)');
    try {
      await api.patch(`/admin/events/${rejecting.event_id}/reject`, { reason: reason.trim() });
      toast.success('Event rejected. The organizer will see your reason.');
      setRejecting(null); setReason(''); setReasonError(''); reload();
    } catch (err) { setReasonError(errorMessage(err)); }
  });

  return (
    <div>
      <PageHeader title="Approvals" subtitle="Review events before students can see them."
        actions={<Select label="Show" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          {['pending', 'approved', 'rejected', 'cancelled'].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</Select>} />
      {loading && !data ? <Spinner label="Loading events" /> : error ? <ErrorState message={error} onRetry={reload} /> :
        data.list.length === 0 ? <EmptyState title={status === 'pending' ? 'Nothing waiting for approval' : `No ${status} events`} text="New submissions will show up here." /> : (
          <>
            <Table columns={['Event', 'Organizer', 'When', 'Price', 'Capacity', 'Status', status === 'pending' ? 'Decision' : '']}>
              {data.list.map((e) => (
                <tr key={e.event_id}>
                  <Td><Link to={`/events/${e.event_id}`} className="font-semibold hover:text-jacaranda-600">{e.title}</Link><p className="text-xs text-ink-500">{e.venue?.name} · {e.category?.name}</p></Td>
                  <Td>{e.organizer?.org_name || e.organizer?.name}</Td>
                  <Td className="whitespace-nowrap text-ink-500">{dateLong(e.event_date)}<br />{timeShort(e.event_time)}</Td>
                  <Td>{money(e.price)}</Td><Td>{e.capacity}</Td><Td><StatusBadge status={e.status} /></Td>
                  <Td>{e.status === 'pending' && <div className="flex gap-1">
                    <Button size="sm" variant="success" icon={Check} disabled={approving} onClick={() => approve(e)}>Approve</Button>
                    <Button size="sm" variant="secondary" icon={X} onClick={() => setRejecting(e)}>Reject</Button></div>}
                    {e.status === 'rejected' && e.rejection_reason && <p className="max-w-[14rem] text-xs text-ink-500">{e.rejection_reason}</p>}</Td>
                </tr>
              ))}
            </Table>
            <Pagination meta={data.meta} onPage={setPage} />
          </>
        )}
      <Modal open={Boolean(rejecting)} onClose={() => { setRejecting(null); setReasonError(''); }} title="Reject this event"
        footer={<><Button variant="secondary" onClick={() => setRejecting(null)} disabled={rejectingBusy}>Cancel</Button><Button variant="danger" loading={rejectingBusy} onClick={reject}>Reject event</Button></>}>
        <p className="mb-3 text-ink-700">Tell the organizer what to fix in <strong>{rejecting?.title}</strong>.</p>
        <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} error={reasonError} maxLength={500} />
      </Modal>
    </div>
  );
}
