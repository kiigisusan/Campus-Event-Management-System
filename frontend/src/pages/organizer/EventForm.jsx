import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { errorMessage, fieldErrors, unwrap } from '../../lib/api';
import { positiveInt, required, minLen, validate } from '../../lib/validate';
import { useLoad, useSubmit } from '../../lib/useAsync';
import { useToast } from '../../context/ToastContext';
import { Button, Card, ErrorState, InlineError, Input, PageHeader, Select, Spinner, Textarea } from '../../components/ui';

const EMPTY = { title: '', description: '', event_date: '', event_time: '', venue_id: '', category_id: '', capacity: '', price: '0', image_url: '' };

export default function EventForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const [v, setV] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');

  const lists = useLoad(async () => {
    const [c, vn] = await Promise.all([api.get('/categories'), api.get('/venues')]);
    return { categories: unwrap(c).categories, venues: unwrap(vn).venues };
  }, []);
  const existing = useLoad(async () => (editing ? unwrap(await api.get(`/events/${id}`)).event : null), [id]);

  useEffect(() => {
    const e = existing.data;
    if (e) setV({ title: e.title, description: e.description, event_date: e.event_date, event_time: e.event_time, venue_id: String(e.venue_id), category_id: String(e.category_id), capacity: String(e.capacity), price: String(e.price), image_url: e.image_url || '' });
  }, [existing.data]);

  const change = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const venue = lists.data?.venues.find((x) => String(x.venue_id) === v.venue_id);

  const check = () => {
    const found = validate(v, {
      title: minLen('Title', 3), description: minLen('Description', 10),
      event_date: required('Date'), event_time: required('Start time'),
      venue_id: required('Venue'), category_id: required('Category'), capacity: positiveInt('Capacity'),
      price: (p) => (Number(p) >= 0 && p !== '' ? '' : 'Price must be 0 or more (use 0 for free)'),
    });
    if (!found.capacity && venue && Number(v.capacity) > venue.capacity) found.capacity = `Capacity can’t be more than the venue’s ${venue.capacity}`;
    if (!found.event_date && v.event_date < new Date().toISOString().slice(0, 10)) found.event_date = 'Pick a date that isn’t in the past';
    if (v.image_url && !/^https?:\/\/\S+$/.test(v.image_url)) found.image_url = 'Enter a full link starting with https://';
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  const body = () => ({
    title: v.title.trim(), description: v.description.trim(), event_date: v.event_date, event_time: v.event_time,
    venue_id: Number(v.venue_id), category_id: Number(v.category_id), capacity: Number(v.capacity), price: Number(v.price),
    ...(v.image_url.trim() ? { image_url: v.image_url.trim() } : editing ? { image_url: null } : {}),
  });

  const [busy, save] = useSubmit(async (submitAfter) => {
    setMessage('');
    if (!check()) return;
    try {
      const { event } = unwrap(editing ? await api.patch(`/events/${id}`, body()) : await api.post('/events', body()));
      if (submitAfter && ['draft', 'rejected'].includes(event.status)) await api.patch(`/events/${event.event_id}/submit`);
      toast.success(submitAfter ? 'Sent for approval.' : editing ? 'Changes saved.' : 'Draft saved.');
      navigate('/organizer');
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage(errorMessage(err));
    }
  });

  if (lists.loading || existing.loading) return <Spinner label="Loading form" />;
  if (lists.error || existing.error) return <ErrorState message={lists.error || existing.error} onRetry={() => { lists.reload(); existing.reload(); }} />;
  const status = existing.data?.status;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={editing ? 'Edit event' : 'Create an event'} subtitle="Students see it after an admin approves it." />
      <form onSubmit={(e) => { e.preventDefault(); save(false); }} noValidate>
        <Card className="space-y-4">
          <InlineError>{message}</InlineError>
          {status === 'approved' && <p className="rounded-lg bg-sunbird-50 px-4 py-3 text-sm font-medium text-sunbird-700">This event is live. Changes apply right away, but you can’t lower the capacity below the seats already booked.</p>}
          <Input label="Title" value={v.title} onChange={change('title')} error={errors.title} maxLength={150} />
          <Textarea label="Description" value={v.description} onChange={change('description')} error={errors.description} rows={6} help="What will happen, who it’s for, what to bring." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Date" type="date" value={v.event_date} onChange={change('event_date')} error={errors.event_date} />
            <Input label="Start time" type="time" value={v.event_time} onChange={change('event_time')} error={errors.event_time} />
            <Select label="Venue" value={v.venue_id} onChange={change('venue_id')} error={errors.venue_id}>
              <option value="">Choose a venue</option>{lists.data.venues.map((x) => <option key={x.venue_id} value={x.venue_id}>{x.name} (fits {x.capacity})</option>)}
            </Select>
            <Select label="Category" value={v.category_id} onChange={change('category_id')} error={errors.category_id}>
              <option value="">Choose a category</option>{lists.data.categories.map((x) => <option key={x.category_id} value={x.category_id}>{x.name}</option>)}
            </Select>
            <Input label="Capacity" type="number" min="1" value={v.capacity} onChange={change('capacity')} error={errors.capacity}
              hint="How many people can attend. It can’t be more than the venue holds." help={venue ? `${venue.name} holds ${venue.capacity}.` : undefined} />
            <Input label="Price (KES)" type="number" min="0" step="1" value={v.price} onChange={change('price')} error={errors.price} hint="Use 0 for a free event. Paid events are collected with M-Pesa." />
          </div>
          <Input label="Poster image link (optional)" type="url" value={v.image_url} onChange={change('image_url')} error={errors.image_url} placeholder="https://…" />
          <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 pt-4">
            <Button variant="secondary" onClick={() => navigate('/organizer')} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="secondary" loading={busy}>{editing ? 'Save changes' : 'Save as draft'}</Button>
            {(!editing || ['draft', 'rejected'].includes(status)) && <Button loading={busy} onClick={() => save(true)}>{editing ? 'Save and submit' : 'Save and submit for approval'}</Button>}
          </div>
        </Card>
      </form>
    </div>
  );
}
