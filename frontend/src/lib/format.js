const KES = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 });

export const money = (n) => (Number(n) === 0 ? 'Free' : KES.format(Number(n)));
export const moneyPlain = (n) => KES.format(Number(n || 0));

/** '2026-11-14' -> Sat, 14 Nov 2026 */
export function dateLong(iso) {
  if (!iso) return '';
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-KE', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function dateParts(iso) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return {
    day: d.getDate(),
    month: d.toLocaleDateString('en-KE', { month: 'short' }),
    weekday: d.toLocaleDateString('en-KE', { weekday: 'short' }),
  };
}

/** '14:30' -> 2:30 pm */
export function timeShort(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}

export const dateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-KE', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        timeZone: 'Africa/Nairobi',
      })
    : '';

export const percent = (n) => `${Number(n || 0).toFixed(0)}%`;

export const titleCase = (s) => (s ? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '');
