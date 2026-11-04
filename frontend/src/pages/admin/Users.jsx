import { useState } from 'react';
import { KeyRound, Power, UserPlus } from 'lucide-react';
import api, { errorMessage, fieldErrors, metaOf, unwrap } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { email as emailRule, minLen, studentId, validate } from '../../lib/validate';
import { useDebounced, useLoad, useSubmit } from '../../lib/useAsync';
import { useToast } from '../../context/ToastContext';
import { Badge, Button, EmptyState, ErrorState, InlineError, Input, Modal, PageHeader, Pagination, Select, Spinner, Table, Td } from '../../components/ui';

const BLANK = { role: 'student', name: '', email: '', student_id_number: '', programme: '', org_name: '', access_level: '1' };

export default function Users() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [role, setRole] = useState('');
  const [active, setActive] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [v, setV] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [secret, setSecret] = useState(null); // { name, password } shown once
  const [toggleTarget, setToggleTarget] = useState(null);

  const { data, loading, error, reload } = useLoad(async () => {
    const res = await api.get('/admin/users', { params: { search: q || undefined, role: role || undefined, is_active: active || undefined, page, pageSize: 15 } });
    return { list: unwrap(res).users, meta: metaOf(res) };
  }, [q, role, active, page]);

  const change = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));

  const [creating, create] = useSubmit(async (e) => {
    e.preventDefault();
    const rules = { name: minLen('Name', 2), email: emailRule };
    if (v.role === 'student') rules.student_id_number = studentId;
    if (v.role === 'organizer') rules.org_name = minLen('Organisation name', 2);
    const found = validate(v, rules);
    setErrors(found);
    if (Object.keys(found).length) return;
    const body = { role: v.role, name: v.name.trim(), email: v.email.trim() };
    if (v.role === 'student') { body.student_id_number = v.student_id_number.trim(); if (v.programme.trim()) body.programme = v.programme.trim(); }
    if (v.role === 'organizer') body.org_name = v.org_name.trim();
    if (v.role === 'admin') body.access_level = Number(v.access_level);
    try {
      const res = unwrap(await api.post('/admin/users', body));
      setAdding(false); setV(BLANK); setMessage('');
      if (res.temporaryPassword) setSecret({ name: res.user?.name ?? body.name, password: res.temporaryPassword });
      else toast.success('User added.');
      reload();
    } catch (err) { setErrors(fieldErrors(err)); setMessage(errorMessage(err)); }
  });

  const [toggling, toggle] = useSubmit(async () => {
    const u = toggleTarget;
    try {
      await api.patch(`/admin/users/${u.user_id}/${u.is_active ? 'deactivate' : 'activate'}`);
      toast.success(u.is_active ? 'Account deactivated. They’ve been logged out.' : 'Account reactivated.');
      reload();
    } catch (err) { toast.error(errorMessage(err)); }
    setToggleTarget(null);
  });

  const [resetting, resetPassword] = useSubmit(async (u) => {
    try {
      const res = unwrap(await api.post(`/admin/users/${u.user_id}/reset-password`));
      setSecret({ name: u.name, password: res.temporaryPassword });
    } catch (err) { toast.error(errorMessage(err)); }
  });

  return (
    <div>
      <PageHeader title="Users" subtitle="Add people, deactivate accounts, and reset passwords."
        actions={<Button icon={UserPlus} onClick={() => { setAdding(true); setErrors({}); setMessage(''); }}>Add user</Button>} />
      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <Input label="Search" type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Name, email, student ID" />
        <Select label="Role" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}><option value="">All roles</option><option value="student">Students</option><option value="organizer">Organizers</option><option value="admin">Admins</option></Select>
        <Select label="Account" value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }}><option value="">Active and inactive</option><option value="true">Active</option><option value="false">Deactivated</option></Select>
      </div>

      {loading && !data ? <Spinner label="Loading users" /> : error ? <ErrorState message={error} onRetry={reload} /> :
        data.list.length === 0 ? <EmptyState title="No users match" text="Try a different search or filter." /> : (
          <>
            <Table columns={['Name', 'Role', 'Details', 'Joined', 'Status', 'Actions']}>
              {data.list.map((u) => (
                <tr key={u.user_id}>
                  <Td><p className="font-semibold">{u.name}</p><p className="text-xs text-ink-500">{u.email}</p></Td>
                  <Td><Badge tone={u.role === 'admin' ? 'brand' : 'neutral'}>{u.role === 'admin' && u.access_level === 2 ? 'Super admin' : u.role}</Badge></Td>
                  <Td className="text-ink-500">{u.student_id_number || u.org_name || '—'}</Td>
                  <Td className="whitespace-nowrap text-ink-500">{dateTime(u.created_at)}</Td>
                  <Td><Badge tone={u.is_active ? 'success' : 'danger'}>{u.is_active ? 'Active' : 'Deactivated'}</Badge></Td>
                  <Td><div className="flex gap-1">
                    <Button size="sm" variant="ghost" icon={Power} onClick={() => setToggleTarget(u)}>{u.is_active ? 'Deactivate' : 'Reactivate'}</Button>
                    <Button size="sm" variant="ghost" icon={KeyRound} disabled={resetting} onClick={() => resetPassword(u)}>Reset password</Button></div></Td>
                </tr>
              ))}
            </Table>
            <Pagination meta={data.meta} onPage={setPage} />
          </>
        )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a user" wide
        footer={<><Button variant="secondary" onClick={() => setAdding(false)} disabled={creating}>Cancel</Button><Button loading={creating} onClick={create}>Add user</Button></>}>
        <form onSubmit={create} className="space-y-4" noValidate>
          <InlineError>{message}</InlineError>
          <Select label="Role" value={v.role} onChange={change('role')}><option value="student">Student</option><option value="organizer">Organizer</option><option value="admin">Admin</option></Select>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Full name" value={v.name} onChange={change('name')} error={errors.name} />
            <Input label="Email" type="email" value={v.email} onChange={change('email')} error={errors.email} />
            {v.role === 'student' && <><Input label="Student ID" value={v.student_id_number} onChange={change('student_id_number')} error={errors.student_id_number} /><Input label="Programme (optional)" value={v.programme} onChange={change('programme')} error={errors.programme} /></>}
            {v.role === 'organizer' && <Input label="Organisation name" value={v.org_name} onChange={change('org_name')} error={errors.org_name} />}
            {v.role === 'admin' && <Select label="Access level" value={v.access_level} onChange={change('access_level')} hint="Super admins can also manage other admins."><option value="1">Admin</option><option value="2">Super admin</option></Select>}
          </div>
          <p className="text-sm text-ink-500">We generate a temporary password and show it once after you add the user.</p>
          <button type="submit" className="hidden" />
        </form>
      </Modal>

      <Modal open={Boolean(toggleTarget)} onClose={() => setToggleTarget(null)} title={toggleTarget?.is_active ? 'Deactivate this account?' : 'Reactivate this account?'}
        footer={<><Button variant="secondary" onClick={() => setToggleTarget(null)} disabled={toggling}>Cancel</Button><Button variant={toggleTarget?.is_active ? 'danger' : 'primary'} loading={toggling} onClick={toggle}>{toggleTarget?.is_active ? 'Deactivate' : 'Reactivate'}</Button></>}>
        <p>{toggleTarget?.is_active ? `${toggleTarget?.name} will be logged out and won’t be able to log in until you reactivate them.` : `${toggleTarget?.name} will be able to log in again.`}</p>
      </Modal>

      <Modal open={Boolean(secret)} onClose={() => setSecret(null)} title="Temporary password" footer={<Button onClick={() => setSecret(null)}>I’ve copied it</Button>}>
        <p className="mb-3">Give this to <strong>{secret?.name}</strong>. It’s shown only once.</p>
        <code className="block select-all rounded-lg bg-ink-100 px-4 py-3 text-center font-mono text-lg font-bold">{secret?.password}</code>
      </Modal>
    </div>
  );
}
