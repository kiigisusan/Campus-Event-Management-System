import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { PageHeader } from '../../components/ui';

const FAQ = [
  ['For students', [
    ['How do I book an event?', 'Open an event and press Book. Free events are confirmed straight away. Paid events hold your seat for 10 minutes while you pay with M-Pesa.'],
    ['How does M-Pesa payment work?', 'Enter your Safaricom number, then approve the prompt on your phone with your M-Pesa PIN. This page updates by itself when the payment goes through.'],
    ['My payment failed. What now?', 'Use the Retry button on the booking page while your seat is still held. If the 10 minutes ran out, book the event again.'],
    ['Where is my ticket?', 'In My bookings. Open a confirmed booking to see the QR code and download it. We also email it to you.'],
    ['Can I cancel?', 'Yes, from My bookings, any time before the event starts. For a paid booking, the organizer will contact you about the refund.'],
  ]],
  ['For organizers', [
    ['Why can’t students see my event?', 'New events start as drafts. Submit it for approval, and it appears once an admin approves it.'],
    ['My event was rejected.', 'The reason is shown on your dashboard. Edit the event, fix the issue, and submit it again.'],
    ['How do I check people in?', 'Open Scan tickets, choose your event, and point the camera at the student’s QR code. You can also type the code in.'],
  ]],
  ['Accounts', [
    ['I forgot my password.', 'Use “Forgot your password?” on the login page. We’ll email you a reset link.'],
    ['Why does the admin login ask for a code?', 'Admin accounts use a second step for safety. We email a 6-digit code each time.'],
    ['I was logged out by itself.', 'For your safety, you’re logged out after 30 minutes without activity.'],
  ]],
];

function Item({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-ink-100 last:border-0">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 py-4 text-left font-semibold">
        {q}<ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && <p className="pb-4 text-ink-700">{a}</p>}
    </div>
  );
}

export default function Help() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Help and FAQ" subtitle="Quick answers about booking, payments, and running events." />
      <div className="space-y-6">
        {FAQ.map(([group, items]) => (
          <section key={group}>
            <h2 className="mb-2 text-lg font-bold">{group}</h2>
            <div className="card px-5">{items.map(([q, a]) => <Item key={q} q={q} a={a} />)}</div>
          </section>
        ))}
      </div>
      <p className="mt-6 text-sm text-ink-500">First time here? Clear your browser’s site data to see the welcome tour again.</p>
    </div>
  );
}
