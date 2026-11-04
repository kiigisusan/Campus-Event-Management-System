import { useEffect, useState } from 'react';
import { Button, Modal } from './ui';

const STEPS = {
  student: [
    ['Find an event', 'Search and filter on the Events page. Each ticket shows the date, price and how many spots are left.'],
    ['Book in a few taps', 'Free events are confirmed straight away. For paid events, pay with M-Pesa; your seat is held for 10 minutes.'],
    ['Show your QR ticket', 'Open My bookings to see and download your QR code. The organizer scans it at the door.'],
  ],
  organizer: [
    ['Create an event', 'Use New event to save a draft, then submit it. An admin approves it before students can see it.'],
    ['Check people in', 'On Scan tickets, pick your event and scan each student’s QR code with your camera.'],
    ['Track how it’s going', 'Analytics shows bookings against capacity for every event you run.'],
  ],
  admin: [
    ['Approve events', 'The Approvals queue shows events waiting for a decision. Rejections need a reason the organizer will see.'],
    ['Manage people and lists', 'Add users, deactivate accounts, and keep categories and venues up to date.'],
    ['Report and audit', 'Reports export to PDF. The audit log records who did what, and when.'],
  ],
};

/** Three-step welcome shown once per role on a device. */
export default function Tour({ role }) {
  const key = `cems_tour_${role}`;
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(!localStorage.getItem(key)); }, [key]);

  const steps = STEPS[role] || [];
  if (!steps.length) return null;
  const done = () => { localStorage.setItem(key, '1'); setOpen(false); };
  const last = step === steps.length - 1;

  return (
    <Modal open={open} onClose={done} title={`Welcome to CEMS (${step + 1} of ${steps.length})`}
      footer={<>
        <Button variant="ghost" onClick={done}>Skip tour</Button>
        {step > 0 && <Button variant="secondary" onClick={() => setStep(step - 1)}>Back</Button>}
        <Button onClick={() => (last ? done() : setStep(step + 1))}>{last ? 'Get started' : 'Next'}</Button>
      </>}>
      <h3 className="text-xl font-bold">{steps[step][0]}</h3>
      <p className="mt-2 text-ink-700">{steps[step][1]}</p>
    </Modal>
  );
}
