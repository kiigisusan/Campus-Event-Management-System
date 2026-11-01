import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CameraOff, CheckCircle2, XCircle } from 'lucide-react';
import api, { errorCode, errorMessage, unwrap } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { useLoad, useSubmit } from '../../lib/useAsync';
import { Button, Card, EmptyState, ErrorState, InlineError, Input, PageHeader, Select, Spinner } from '../../components/ui';

const READER_ID = 'qr-reader';

const FRIENDLY = {
  ALREADY_CHECKED_IN: 'This ticket was already used',
  NOT_PAID: 'This booking hasn’t been paid for',
  TICKET_CANCELLED: 'This ticket was cancelled',
  WRONG_EVENT: 'This ticket is for a different event',
  INVALID_TICKET: 'We don’t recognise this ticket',
  NOT_YOUR_EVENT: 'You can only check in people for your own events',
};

export default function Scanner() {
  const [eventId, setEventId] = useState('');
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [manual, setManual] = useState('');
  const [log, setLog] = useState([]); // newest first: { ok, text, detail, at }
  const scannerRef = useRef(null);
  const lastScan = useRef({ code: '', at: 0 });
  const eventRef = useRef('');
  eventRef.current = eventId;

  const events = useLoad(async () => unwrap(await api.get('/events/mine', { params: { status: 'approved', pageSize: 100 } })).events, []);

  const [, checkIn] = useSubmit(async (qr_code) => {
    const id = eventRef.current;
    if (!id) return;
    try {
      const { checkIn: result } = unwrap(await api.post('/check-in', { qr_code, event_id: Number(id) }));
      setLog((l) => [{ ok: true, text: result.student.name, detail: 'Checked in', at: new Date() }, ...l].slice(0, 30));
    } catch (e) {
      const code = errorCode(e);
      const when = e.response?.data?.error?.details?.checked_in_at;
      setLog((l) => [{ ok: false, text: FRIENDLY[code] || errorMessage(e), detail: when ? `at ${dateTime(when)}` : '', at: new Date() }, ...l].slice(0, 30));
    }
  });

  const stop = async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    setScanning(false);
    if (s) { try { await s.stop(); s.clear(); } catch { /* already stopped */ } }
  };

  const start = async () => {
    setCameraError('');
    try {
      const s = new Html5Qrcode(READER_ID);
      scannerRef.current = s;
      await s.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, (text) => {
        // The camera reads the same code many times a second; accept it once per 4 seconds.
        const now = Date.now();
        if (text === lastScan.current.code && now - lastScan.current.at < 4000) return;
        lastScan.current = { code: text, at: now };
        checkIn(text);
      });
      setScanning(true);
    } catch {
      scannerRef.current = null;
      setCameraError('We couldn’t open the camera. Allow camera access in your browser, or type the code in below.');
    }
  };

  useEffect(() => () => { stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submitManual = (e) => {
    e.preventDefault();
    if (manual.trim()) { checkIn(manual.trim()); setManual(''); }
  };

  if (events.loading) return <Spinner label="Loading your events" />;
  if (events.error) return <ErrorState message={events.error} onRetry={events.reload} />;
  if (!events.data.length) return <EmptyState title="No approved events to scan for" text="Tickets can be scanned once an admin has approved one of your events." />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Scan tickets" subtitle="Choose the event, then scan each student’s QR code at the door." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-4">
          <Select label="Event" value={eventId} onChange={(e) => { setEventId(e.target.value); }} hint="Tickets only work for the event they were booked for.">
            <option value="">Choose an event</option>{events.data.map((e) => <option key={e.event_id} value={e.event_id}>{e.title} ({e.event_date})</option>)}
          </Select>
          <div id={READER_ID} className={`overflow-hidden rounded-lg bg-black ${scanning ? '' : 'hidden'}`} />
          <InlineError>{cameraError}</InlineError>
          {scanning
            ? <Button variant="secondary" icon={CameraOff} className="w-full" onClick={stop}>Stop camera</Button>
            : <Button icon={Camera} className="w-full" disabled={!eventId} onClick={start}>{eventId ? 'Start camera' : 'Choose an event first'}</Button>}
          <form onSubmit={submitManual} className="flex items-end gap-2 border-t border-ink-100 pt-4">
            <Input label="Or type the ticket code" value={manual} onChange={(e) => setManual(e.target.value)} className="flex-1" placeholder="CEMS1:…" disabled={!eventId} />
            <Button type="submit" variant="secondary" disabled={!eventId || !manual.trim()}>Check in</Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-bold">This session</h2>
          {log.length === 0 ? <p className="text-ink-500">Scanned tickets will appear here.</p> : (
            <ul className="space-y-2" aria-live="polite">
              {log.map((l, i) => (
                <li key={i} className={`flex items-start gap-3 rounded-lg px-3 py-2.5 ${l.ok ? 'bg-acacia-50 text-acacia-700' : 'bg-rose-50 text-rose-700'}`}>
                  {l.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />}
                  <div className="min-w-0 flex-1"><p className="font-semibold">{l.text}</p><p className="text-xs opacity-80">{l.detail}</p></div>
                  <time className="text-xs opacity-70">{l.at.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</time>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}