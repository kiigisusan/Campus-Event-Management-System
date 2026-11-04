import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Clock, Smartphone, XCircle } from 'lucide-react';
import api, { errorCode, errorMessage, unwrap } from '../../lib/api';
import { dateLong, money, timeShort } from '../../lib/format';
import { kenyanPhone } from '../../lib/validate';
import { useLoad, useSubmit } from '../../lib/useAsync';
import { useToast } from '../../context/ToastContext';
import { Button, Card, ErrorState, InlineError, Input, Spinner, StatusBadge } from '../../components/ui';
import TicketQR from '../../components/TicketQR';

/** Counts down to `expiresAt`, returning "mm:ss" (or null once it has passed). */
function useCountdown(expiresAt) {
  const [left, setLeft] = useState(null);
  useEffect(() => {
    if (!expiresAt) return undefined;
    const tick = () => setLeft(Math.max(0, Math.floor((new Date(expiresAt) - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  if (left === null) return null;
  return `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
}

export default function BookingPage() {
  const { id } = useParams();
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [problem, setProblem] = useState('');
  const [waiting, setWaiting] = useState(false); // a PIN prompt has been sent and we are polling
  const { data: booking, loading, error, reload } = useLoad(async () => unwrap(await api.get(`/bookings/${id}`)).booking, [id]);
  const countdown = useCountdown(booking?.status === 'pending' ? booking.expires_at : null);

  // Poll every 3 seconds while payment is pending (README: "Paid booking flow").
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const paymentPending = booking?.status === 'pending' && (waiting || booking.payment?.status === 'pending');
  useEffect(() => {
    if (!paymentPending) return undefined;
    const t = setInterval(() => reloadRef.current(), 3000);
    return () => clearInterval(t);
  }, [paymentPending]);

  // Stop waiting once the payment has an outcome.
  const outcome = booking?.status !== 'pending' || booking?.payment?.status === 'failed';
  useEffect(() => { if (outcome) setWaiting(false); }, [outcome]);
  useEffect(() => { if (booking?.status === 'confirmed' && waiting === false && booking.payment?.status === 'completed') toast.success('Payment received. Your ticket is ready.'); }, [booking?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const [paying, pay] = useSubmit(async (e) => {
    e.preventDefault();
    const msg = kenyanPhone(phone);
    setPhoneError(msg);
    if (msg) return;
    setProblem('');
    try {
      await api.post(`/bookings/${id}/pay`, { phone_number: phone });
      setWaiting(true);
      toast.info('Check your phone and enter your M-Pesa PIN.');
      reload();
    } catch (err) {
      const code = errorCode(err);
      if (code === 'PAYMENT_IN_PROGRESS') setWaiting(true);
      else if (code === 'BOOKING_EXPIRED') reload();
      setProblem(errorMessage(err));
    }
  });

  if (loading && !booking) return <Spinner label="Loading your booking" />;
  if (error && !booking) return <ErrorState message={error} onRetry={reload} />;

  const { event, payment } = booking;
  const failed = booking.status === 'pending' && payment?.status === 'failed' && !waiting;

  return (
    <div className="mx-auto max-w-xl">
      <Link to="/bookings" className="text-sm font-semibold text-jacaranda-600 hover:underline">All my bookings</Link>
      <Card className="mt-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold">{event.title}</h1>
            <p className="mt-1 text-ink-500">{dateLong(event.event_date)} · {timeShort(event.event_time)} · {event.venue?.name}</p>
          </div>
          <StatusBadge status={booking.status} />
        </div>

        {(booking.status === 'confirmed' || booking.status === 'checked_in') && (
          <div className="mt-6 border-t border-dashed border-ink-200 pt-6 text-center">
            <p className="mb-4 flex items-center justify-center gap-2 font-semibold text-acacia-700">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
              {booking.status === 'checked_in' ? 'You’ve been checked in' : 'You’re booked in'}
            </p>
            <TicketQR bookingId={booking.booking_id} title={event.title} />
            {payment?.mpesa_receipt && <p className="mt-4 text-sm text-ink-500">M-Pesa receipt: <strong>{payment.mpesa_receipt}</strong></p>}
          </div>
        )}

        {booking.status === 'pending' && (
          <div className="mt-6 space-y-4 border-t border-dashed border-ink-200 pt-6">
            <div className="flex items-center justify-between rounded-lg bg-sunbird-50 px-4 py-3 text-sunbird-700">
              <span className="flex items-center gap-2 font-semibold"><Clock className="h-4 w-4" aria-hidden />Your seat is held</span>
              <span className="font-display text-xl font-extrabold tabular-nums" aria-live="off">{countdown ?? '--:--'}</span>
            </div>
            <p className="text-sm text-ink-500">Amount to pay: <strong className="text-ink-900">{money(event.price)}</strong></p>

            {waiting ? (
              <div className="rounded-lg border border-jacaranda-100 bg-jacaranda-50 p-4 text-center" role="status">
                <Smartphone className="mx-auto h-8 w-8 animate-pulse text-jacaranda-600" aria-hidden />
                <p className="mt-2 font-semibold">Waiting for your payment</p>
                <p className="text-sm text-ink-500">Enter your M-Pesa PIN on your phone. This page updates by itself.</p>
              </div>
            ) : (
              <form onSubmit={pay} className="space-y-3" noValidate>
                {failed && (
                  <div role="alert" className="flex gap-2 rounded-lg border border-rose-100 bg-rose-50 p-3 text-rose-700">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <p className="text-sm font-medium">Payment didn’t go through{payment.result_desc ? `: ${payment.result_desc}` : '.'} You can try again.</p>
                  </div>
                )}
                <InlineError>{problem}</InlineError>
                <Input label="M-Pesa phone number" type="tel" inputMode="tel" autoComplete="tel" placeholder="0712345678" value={phone}
                  onChange={(e) => setPhone(e.target.value)} error={phoneError} hint="The Safaricom number that will get the payment prompt." />
                <Button type="submit" className="w-full" loading={paying} icon={Smartphone}>{failed ? 'Retry payment' : `Pay ${money(event.price)} with M-Pesa`}</Button>
              </form>
            )}
          </div>
        )}

        {booking.status === 'cancelled' && (
          <div className="mt-6 border-t border-dashed border-ink-200 pt-6 text-center">
            <p className="font-semibold">This reservation is no longer active.</p>
            <p className="mt-1 text-ink-500">If it expired before payment, you can book the event again.</p>
            <Link to={`/events/${event.event_id}`} className="mt-4 inline-block rounded-lg bg-jacaranda-600 px-4 py-2.5 text-sm font-semibold text-ink-50 hover:bg-jacaranda-700">View the event</Link>
          </div>
        )}
      </Card>
    </div>
  );
}