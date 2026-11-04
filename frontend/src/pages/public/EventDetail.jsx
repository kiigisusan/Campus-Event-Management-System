import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, Clock, MapPin, UserRound } from 'lucide-react';
import api, { errorCode, errorMessage, unwrap } from '../../lib/api';
import { dateLong, money, timeShort } from '../../lib/format';
import { useLoad, useSubmit } from '../../lib/useAsync';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Badge, Button, CapacityBar, Card, ErrorState, InlineError, Spinner, StatusBadge } from '../../components/ui';

export default function EventDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [problem, setProblem] = useState({ message: '', code: '' });
  const { data: event, loading, error, reload } = useLoad(async () => unwrap(await api.get(`/events/${id}`)).event, [id]);

  const [booking, book] = useSubmit(async () => {
    setProblem({ message: '', code: '' });
    try {
      const { booking: created } = unwrap(await api.post('/bookings', { event_id: Number(id) }));
      toast.success(created.status === 'confirmed' ? 'You’re in! Your ticket is ready.' : 'Seat held. Pay with M-Pesa to confirm it.');
      navigate(`/bookings/${created.booking_id}`);
    } catch (e) {
      setProblem({ message: errorMessage(e), code: errorCode(e) });
      if (errorCode(e) === 'EVENT_FULL') reload();
    }
  });

  if (loading) return <Spinner label="Loading event" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const soldOut = event.spots_remaining === 0;
  const isStudent = user?.role === 'student';

  return (
    <article className="mx-auto max-w-4xl">
      <Link to="/" className="text-sm font-semibold text-jacaranda-600 hover:underline">Back to events</Link>
      {event.image_url && <img src={event.image_url} alt="" className="mt-3 h-56 w-full rounded-xl object-cover sm:h-72" />}
      <div className="mt-4 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2"><Badge tone="brand">{event.category?.name}</Badge>{event.status !== 'approved' && <StatusBadge status={event.status} />}</div>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">{event.title}</h1>
          <p className="mt-4 max-w-prose whitespace-pre-line text-ink-700">{event.description}</p>
          {event.rejection_reason && <div className="mt-4"><InlineError>Rejected: {event.rejection_reason}</InlineError></div>}
        </div>

        <Card className="h-fit space-y-4 lg:sticky lg:top-24">
          <p className="font-display text-3xl font-extrabold">{money(event.price)}</p>
          <ul className="space-y-2 text-sm text-ink-700">
            <li className="flex gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-ink-500" aria-hidden />{dateLong(event.event_date)}</li>
            <li className="flex gap-2"><Clock className="h-4 w-4 shrink-0 text-ink-500" aria-hidden />{timeShort(event.event_time)}</li>
            <li className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-ink-500" aria-hidden />{event.venue?.name}, {event.venue?.location}</li>
            <li className="flex gap-2"><UserRound className="h-4 w-4 shrink-0 text-ink-500" aria-hidden />{event.organizer?.org_name || event.organizer?.name}</li>
          </ul>
          <CapacityBar capacity={event.capacity} remaining={event.spots_remaining} />
          <InlineError>{problem.message}</InlineError>
          {problem.code === 'ALREADY_BOOKED' && <Link to="/bookings" className="block text-sm font-semibold text-jacaranda-600 hover:underline">Go to My bookings</Link>}

          {!user ? (
            <Button className="w-full" onClick={() => navigate('/login', { state: { from: `/events/${id}` } })}>Log in to book</Button>
          ) : isStudent ? (
            <Button className="w-full" loading={booking} disabled={soldOut || event.status !== 'approved'} onClick={book}>
              {soldOut ? 'Sold out' : event.price > 0 ? `Book and pay ${money(event.price)}` : 'Book for free'}
            </Button>
          ) : (
            <p className="text-sm text-ink-500">Only students can book events.</p>
          )}
        </Card>
      </div>
    </article>
  );
}
