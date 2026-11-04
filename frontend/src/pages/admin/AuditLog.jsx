import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import api, { downloadFile, errorMessage, metaOf, unwrap } from '../../lib/api';
import { dateTime, titleCase } from '../../lib/format';
import { useDebounced, useLoad, useSubmit } from '../../lib/useAsync';
import { useToast } from '../../context/ToastContext';
import { Badge, Button, EmptyState, ErrorState, InlineError, Input, PageHeader, Pagination, Select, Spinner, Table, Td } from '../../components/ui';

const fmtDetails = (d) => (d && typeof d === 'object' ? Object.entries(d).map(([k, v]) => `${titleCase(k)}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ') : d || '');

export default function AuditLog() {
  const toast = useToast();
  const [f, setF] = useState({ from: '', to: '', action: '', search: '', order: 'desc' });
  const [page, setPage] = useState(1);
  const search = useDebounced(f.search);
  const dateError = f.from && f.to && f.from > f.to ? 'The start date must be on or before the end date' : '';
  const params = useMemo(() => ({ from: f.from || undefined, to: f.to || undefined, action: f.action || undefined, search: search || undefined, order: f.order }), [f.from, f.to, f.action, search, f.order]);

  const actions = useLoad(async () => unwrap(await api.get('/audit-logs/actions')).actions, []);
  const { data, loading, error, reload } = useLoad(async () => {
    if (dateError) return null;
    const res = await api.get('/audit-logs', { params: { ...params, page, pageSize: 20 } });
    return { list: unwrap(res).logs, meta: metaOf(res) };
  }, [params, page, dateError]);

  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setPage(1); };
  const [exporting, exportPdf] = useSubmit(async () => {
    try { await downloadFile('/audit-logs/pdf', params, 'audit-log.pdf'); toast.success('PDF downloaded.'); }
    catch (e) { toast.error(errorMessage(e, 'We couldn’t create the PDF.')); }
  });

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Who did what, and when."
        actions={<Button icon={Download} loading={exporting} disabled={Boolean(dateError)} onClick={exportPdf}>Export PDF</Button>} />
      <form onSubmit={(e) => e.preventDefault()} className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Input label="Search by person" type="search" value={f.search} onChange={set('search')} placeholder="Name or email" />
        <Select label="Action" value={f.action} onChange={set('action')}><option value="">All actions</option>{actions.data?.map((a) => <option key={a} value={a}>{titleCase(a.toLowerCase())}</option>)}</Select>
        <Input label="From" type="date" value={f.from} onChange={set('from')} />
        <Input label="To" type="date" value={f.to} onChange={set('to')} error={dateError} />
        <Select label="Order" value={f.order} onChange={set('order')}><option value="desc">Newest first</option><option value="asc">Oldest first</option></Select>
      </form>

      {dateError ? <InlineError>{dateError}</InlineError> : loading && !data ? <Spinner label="Loading the log" /> : error ? <ErrorState message={error} onRetry={reload} /> :
        !data || data.list.length === 0 ? <EmptyState title="No activity matches" text="Try a wider date range or clear the filters." /> : (
          <>
            <Table columns={['When', 'Who', 'Action', 'Target', 'Details']}>
              {data.list.map((l) => (
                <tr key={l.log_id}>
                  <Td className="whitespace-nowrap text-ink-500">{dateTime(l.timestamp)}</Td>
                  <Td>{l.user ? <><p className="font-semibold">{l.user.name}</p><p className="text-xs text-ink-500">{l.user.role}</p></> : <span className="text-ink-500">System</span>}</Td>
                  <Td><Badge tone="brand">{titleCase(l.action.toLowerCase())}</Badge></Td>
                  <Td className="text-ink-500">{l.target_type ? `${l.target_type} ${l.target_id ?? ''}` : '—'}</Td>
                  <Td className="max-w-xs text-xs text-ink-500">{fmtDetails(l.details)}</Td>
                </tr>
              ))}
            </Table>
            <Pagination meta={data.meta} onPage={setPage} />
          </>
        )}
    </div>
  );
}
