/**
 * Event date/time helpers.
 *
 * events.event_date (DATE) and events.event_time (TIME) hold the wall-clock
 * time the organizer typed, in Kenyan time (EAT, UTC+3, no daylight saving).
 * Prisma returns both as JavaScript Dates in UTC, so they must be combined and
 * shifted to get the real moment the event starts.
 */

/** East Africa Time is always UTC+3. */
export const EAT_OFFSET_MINUTES = 180;

/**
 * The exact moment an event starts.
 * @param {{ event_date: Date, event_time: Date }} event
 * @returns {Date}
 */
export function eventStartsAt({ event_date: date, event_time: time }) {
  const wallClockAsUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    time.getUTCHours(),
    time.getUTCMinutes(),
    time.getUTCSeconds(),
  );
  return new Date(wallClockAsUtc - EAT_OFFSET_MINUTES * 60_000);
}

/** True once the event's start time has passed. */
export const hasEventStarted = (event, now = new Date()) => eventStartsAt(event) <= now;

const dateTimeFormatter = new Intl.DateTimeFormat('en-KE', {
  timeZone: 'Africa/Nairobi',
  dateStyle: 'full',
  timeStyle: 'short',
});

/** Human-readable start time for emails, e.g. "Thursday, 29 October 2026 at 14:00". */
export const formatEventStart = (event) => dateTimeFormatter.format(eventStartsAt(event));
