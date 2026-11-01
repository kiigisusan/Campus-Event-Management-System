import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import api, { errorMessage, fieldErrors, unwrap } from '../../lib/api';
import { minLen, positiveInt, validate } from '../../lib/validate';
import { useLoad, useSubmit } from '../../lib/useAsync';
import { useToast } from '../../context/ToastContext';
import { Button, ConfirmModal, EmptyState, ErrorState, InlineError, Input, Modal, PageHeader, Spinner, Table, Td, Textarea } from '../../components/ui';

const CONFIG = {
  categories: {
    path: '/categories', key: 'categories', idKey: 'category_id', singular: 'category', blank: { name: '', description: '' },
    rules: { name: minLen('Name', 2) }, columns: ['Name', 'Description', ''],
    body: (v) => ({ name: v.name.trim(), description: v.description.trim() || null }),
  },
  venues: {
    path: '/venues', key: 'venues', idKey: 'venue_id', singular: 'venue', blank: { name: '', location: '', capacity: '' },
    rules: { name: minLen('Name', 2), location: minLen('Location', 2), capacity: positiveInt('Capacity') }, columns: ['Name', 'Location', 'Capacity', ''],
    body: (v) => ({ name: v.name.trim(), location: v.location.trim(), capacity: Number(v.capacity) }),
  },
};

function Section({ type }) {
  const cfg = CONFIG[type];
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(async () => unwrap(await api.get(cfg.path))[cfg.key], [type]);
  const [editing, setEditing] = useState(null); // null | 'new' | row
  const [v, setV] = useState(cfg.blank);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [deleting, setDeleting] = useState(null);

  const open = (row) => {
    setEditing(row);
    setV(row === 'new' ? cfg.blank : Object.fromEntries(Object.keys(cfg.blank).map((k) => [k, row[k] ?? ''])));
    setErrors({}); setMessage('');
  };
  const change = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));

  const [saving, save] = useSubmit(async (e) => {
    e?.preventDefault();
    const found = validate(v, cfg.rules);
    setErrors(found);
    if (Object.keys(found).length) return;
    try {
      if (editing === 'new') await api.post(cfg.path, cfg.body(v));
      else await api.patch(`${cfg.path}/${editing[cfg.idKey]}`, cfg.body(v));
      toast.success(`${cfg.singular[0].toUpperCase() + cfg.singular.slice(1)} saved.`);
      setEditing(null); reload();
    } catch (err) { setErrors(fieldErrors(err)); setMessage(errorMessage(err)); }
  });

  const [removing, remove] = useSubmit(async () => {
    try { await api.delete(`${cfg.path}/${deleting[cfg.idKey]}`); toast.success(`${cfg.singular[0].toUpperCase() + cfg.singular.slice(1)} deleted.`); reload(); }
    catch (err) { toast.error(errorMessage(err)); }
    setDeleting(null);
  });

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-bold capitalize">{cfg.key}</h2><Button size="sm" icon={Plus} onClick={() => open('new')}>Add {cfg.singular}</Button></div>
      {loading && !data ? <Spinner /> : error ? <ErrorState message={error} onRetry={reload} /> : data.length === 0 ? <EmptyState title={`No ${cfg.key} yet`} action={<Button onClick={() => open('new')}>Add {cfg.singular}</Button>} /> : (
        <Table columns={cfg.columns}>
          {data.map((r) => (
            <tr key={r[cfg.idKey]}>
              <Td className="font-semibold">{r.name}</Td>
              <Td className="text-ink-500">{r.description ?? r.location ?? '—'}</Td>
              {type === 'venues' && <Td>{r.capacity}</Td>}
              <Td><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" icon={Pencil} onClick={() => open(r)}>Edit</Button><Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDeleting(r)}>Delete</Button></div></Td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={`${editing === 'new' ? 'Add' : 'Edit'} ${cfg.singular}`}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button><Button loading={saving} onClick={save}>Save {cfg.singular}</Button></>}>
        <form onSubmit={save} className="space-y-4" noValidate>
          <InlineError>{message}</InlineError>
          <Input label="Name" value={v.name} onChange={change('name')} error={errors.name} />
          {type === 'categories' && <Textarea label="Description (optional)" rows={3} value={v.description} onChange={change('description')} error={errors.description} />}
          {type === 'venues' && <><Input label="Location" value={v.location} onChange={change('location')} error={errors.location} placeholder="Building, floor, room" />
            <Input label="Capacity" type="number" min="1" value={v.capacity} onChange={change('capacity')} error={errors.capacity} hint="The most people the venue can hold. Events here can’t exceed it." /></>}
          <button type="submit" className="hidden" />
        </form>
      </Modal>
      <ConfirmModal open={Boolean(deleting)} onClose={() => setDeleting(null)} danger loading={removing} onConfirm={remove} title={`Delete ${cfg.singular}?`} confirmLabel="Delete"
        text={`“${deleting?.name}” will be removed. If events still use it, it can’t be deleted.`} />
    </section>
  );
}

export default function Catalog() {
  return (
    <div>
      <PageHeader title="Categories and venues" subtitle="The lists organizers choose from when they create an event." />
      <Section type="categories" />
      <Section type="venues" />
    </div>
  );
}
