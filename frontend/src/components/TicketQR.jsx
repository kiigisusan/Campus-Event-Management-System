import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import api from '../lib/api';
import { Button, Spinner } from './ui';

/**
 * Loads the ticket PNG from GET /bookings/:id/qr. The endpoint needs the Bearer
 * token, so an <img src> would not work; we fetch it as a blob instead.
 */
export default function TicketQR({ bookingId, title }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl = '';
    let alive = true;
    api
      .get(`/bookings/${bookingId}/qr`, { responseType: 'blob' })
      .then((res) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(res.data);
        setUrl(objectUrl);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [bookingId]);

  if (failed) return <p className="text-sm text-rose-600">We couldn’t load your QR code. Refresh the page to try again.</p>;
  if (!url) return <Spinner label="Loading your ticket" />;

  const safe = (title || 'ticket').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return (
    <div className="flex flex-col items-center gap-3">
      <img src={url} alt="Your QR ticket. Show it at the door." className="h-60 w-60 rounded-lg border border-ink-100 bg-white p-2" />
      <a href={url} download={`ticket-${safe}.png`}>
        <Button variant="secondary" icon={Download} tabIndex={-1}>Download QR code</Button>
      </a>
    </div>
  );
}
