/**
 * Shared UI kit: buttons, form fields, badges, modal, table, pagination,
 * capacity bar and the loading / empty / error states used on every page.
 */
import { useEffect, useId, useRef } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, HelpCircle, Inbox, Loader2, X } from 'lucide-react';

const cx = (...c) => c.filter(Boolean).join(' ');

// --- Buttons --------------------------------------------------------------

const BUTTON = {
  primary: 'bg-jacaranda-600 text-ink-50 shadow-glow-sm hover:bg-jacaranda-700 hover:shadow-glow disabled:bg-jacaranda-200',
  secondary: 'bg-surface text-ink-800 border border-ink-200 hover:bg-ink-100 disabled:text-ink-300',
  danger: 'bg-rose-600 text-ink-50 hover:bg-rose-700 disabled:bg-rose-100',
  success: 'bg-acacia-600 text-ink-50 hover:bg-acacia-700 disabled:bg-acacia-100',
  ghost: 'text-ink-700 hover:bg-ink-100 disabled:text-ink-300',
};

/** `loading` shows a spinner and disables the button, so a double click cannot submit twice. */
export function Button({ variant = 'primary', size = 'md', loading, disabled, icon: Icon, children, className, ...props }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed',
        size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-sm',
        BUTTON[variant], className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : Icon && <Icon className="h-4 w-4" aria-hidden />}
      {children}
    </button>
  );
}

// --- Form fields ----------------------------------------------------------

/** A hover/focus tooltip for form fields and icons. */
export function Tip({ text }) {
  return (
    <span className="group relative inline-flex">
      <button type="button" aria-label={`Help: ${text}`} className="text-ink-300 hover:text-jacaranda-600">
        <HelpCircle className="h-4 w-4" />
      </button>
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-lg border border-ink-200 bg-ink-100 px-3 py-2 text-xs font-normal leading-snug text-ink-800 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

/** Label + input slot + error message. `hint` adds a tooltip next to the label. */
export function Field({ label, error, hint, help, id, children, className }) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <label htmlFor={id} className="text-sm font-semibold text-ink-800">{label}</label>
        {hint && <Tip text={hint} />}
      </div>
      {children}
      {help && !error && <p className="mt-1 text-xs text-ink-500">{help}</p>}
      {error && <p id={`${id}-error`} role="alert" className="mt-1 text-sm font-medium text-rose-600">{error}</p>}
    </div>
  );
}

const INPUT = 'w-full rounded-lg border bg-surface px-3 py-2.5 text-ink-900 placeholder:text-ink-300 focus:border-jacaranda-600 disabled:bg-ink-50';

export function Input({ label, error, hint, help, className, id: idProp, ...props }) {
  const auto = useId();
  const id = idProp || auto;
  return (
    <Field label={label} error={error} hint={hint} help={help} id={id} className={className}>
      <input id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
        className={cx(INPUT, error ? 'border-rose-600' : 'border-ink-200')} {...props} />
    </Field>
  );
}

export function Textarea({ label, error, hint, help, className, id: idProp, ...props }) {
  const auto = useId();
  const id = idProp || auto;
  return (
    <Field label={label} error={error} hint={hint} help={help} id={id} className={className}>
      <textarea id={id} rows={4} aria-invalid={Boolean(error)}
        className={cx(INPUT, error ? 'border-rose-600' : 'border-ink-200')} {...props} />
    </Field>
  );
}

export function Select({ label, error, hint, help, className, id: idProp, children, ...props }) {
  const auto = useId();
  const id = idProp || auto;
  return (
    <Field label={label} error={error} hint={hint} help={help} id={id} className={className}>
      <select id={id} aria-invalid={Boolean(error)}
        className={cx(INPUT, error ? 'border-rose-600' : 'border-ink-200')} {...props}>
        {children}
      </select>
    </Field>
  );
}

// --- Badges ---------------------------------------------------------------

const TONES = {
  neutral: 'bg-ink-100 text-ink-700',
  brand: 'bg-jacaranda-100 text-jacaranda-700',
  success: 'bg-acacia-100 text-acacia-700',
  warning: 'bg-sunbird-100 text-sunbird-700',
  danger: 'bg-rose-100 text-rose-700',
};

export const Badge = ({ tone = 'neutral', children }) => (
  <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', TONES[tone])}>{children}</span>
);

const STATUS_TONE = {
  draft: 'neutral', pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'neutral',
  confirmed: 'success', checked_in: 'brand', completed: 'success', failed: 'danger',
  active: 'success', inactive: 'danger',
};

export const StatusBadge = ({ status }) => (
  <Badge tone={STATUS_TONE[status] || 'neutral'}>{status === 'checked_in' ? 'Checked in' : status.charAt(0).toUpperCase() + status.slice(1)}</Badge>
);

// --- Layout bits ----------------------------------------------------------

export const PageHeader = ({ title, subtitle, actions }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-1 max-w-2xl text-ink-500">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

export const Card = ({ className, children, ...props }) => (
  <div className={cx('card p-5', className)} {...props}>{children}</div>
);

export const Spinner = ({ label = 'Loading' }) => (
  <div role="status" className="flex items-center justify-center gap-2 py-16 text-ink-500">
    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
    <span>{label}…</span>
  </div>
);

export const EmptyState = ({ title, text, action, icon: Icon = Inbox }) => (
  <div className="flex flex-col items-center rounded-xl border border-dashed border-ink-200 bg-surface px-6 py-14 text-center">
    <Icon className="h-9 w-9 text-ink-300" aria-hidden />
    <h3 className="mt-3 text-lg font-bold">{title}</h3>
    {text && <p className="mt-1 max-w-sm text-ink-500">{text}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const ErrorState = ({ message, onRetry }) => (
  <div role="alert" className="flex flex-col items-center rounded-xl border border-rose-100 bg-rose-50 px-6 py-12 text-center">
    <AlertTriangle className="h-9 w-9 text-rose-600" aria-hidden />
    <h3 className="mt-3 text-lg font-bold text-rose-700">We couldn’t load this</h3>
    <p className="mt-1 max-w-sm text-rose-700">{message}</p>
    {onRetry && <Button variant="secondary" className="mt-4" onClick={onRetry}>Try again</Button>}
  </div>
);

export const InlineError = ({ children }) =>
  children ? <div role="alert" className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{children}</div> : null;

/** Shows how full an event is. Turns amber when nearly full, red when sold out. */
export function CapacityBar({ capacity, remaining }) {
  const taken = capacity - remaining;
  const pct = capacity ? Math.round((taken / capacity) * 100) : 0;
  const tone = remaining === 0 ? 'bg-rose-600' : pct >= 80 ? 'bg-sunbird-600' : 'bg-acacia-600';
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-semibold">{remaining === 0 ? 'Sold out' : `${remaining} of ${capacity} spots left`}</span>
        <span className="text-ink-500">{pct}% full</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Event capacity used">
        <div className={cx('h-full rounded-full transition-all', tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// --- Modal ----------------------------------------------------------------

export function Modal({ open, onClose, title, children, footer, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className={cx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-surface sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-500 hover:bg-ink-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Yes/no confirmation. `onConfirm` may be async; the button locks while it runs. */
export function ConfirmModal({ open, onClose, title, text, confirmLabel = 'Confirm', danger, loading, onConfirm }) {
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={loading}>Keep it</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </>}>
      <p className="text-ink-700">{text}</p>
    </Modal>
  );
}

// --- Table & pagination ---------------------------------------------------

/** Scrolls sideways inside its own box so the page never overflows on phones. */
export const Table = ({ columns, children }) => (
  <div className="card overflow-x-auto">
    <table className="w-full min-w-[640px] text-left text-sm">
      <thead className="border-b border-ink-100 bg-ink-50 text-ink-500">
        <tr>{columns.map((c) => <th key={c} scope="col" className="px-4 py-3 font-semibold">{c}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-ink-100">{children}</tbody>
    </table>
  </div>
);
export const Td = ({ className, ...p }) => <td className={cx('px-4 py-3 align-middle', className)} {...p} />;

export function Pagination({ meta, onPage }) {
  if (!meta || meta.totalPages <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-5 flex items-center justify-between">
      <p className="text-sm text-ink-500">Page {meta.page} of {meta.totalPages} · {meta.total} results</p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" icon={ChevronLeft} disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>Previous</Button>
        <Button variant="secondary" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}

export const Stat = ({ label, value, sub, tone }) => (
  <Card>
    <p className="text-sm font-medium text-ink-500">{label}</p>
    <p className={cx('mt-1 font-display text-3xl font-extrabold', tone === 'warn' && 'text-sunbird-600')}>{value}</p>
    {sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}
  </Card>
);