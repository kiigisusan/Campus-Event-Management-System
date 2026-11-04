import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarSearch, MapPin, Search } from 'lucide-react';
import api, { metaOf, unwrap } from '../../lib/api';
import { dateParts, money, timeShort } from '../../lib/format';
import { useDebounced, useLoad } from '../../lib/useAsync';
import { Badge, Button, EmptyState, ErrorState, Input, Pagination, Select } from '../../components/ui';

/** The ticket card: a date stub on the left, torn from the details by a dashed edge. */
export function EventTicket({ event }) {
  const { day, month, weekday } = dateParts(event.event_date);
  const soldOut = event.spots_remaining === 0;
  return (
    <Link to={`/events/${event.event_id}`}
      className="group flex overflow-hidden rounded-stub border border-ink-100 bg-surface transition hover:border-jacaranda-600/60 hover:shadow-glow">
      <div className="stub-edge relative flex w-24 shrink-0 flex-col items-center justify-center bg-gradient-to-b from-jacaranda-600 to-bloom-600 px-2 py-5 text-ink-50">
        <span className="text-xs font-semibold opacity-80">{weekday}</span>
        <span className="font-display text-4xl font-extrabold leading-none">{day}</span>
        <span className="text-sm font-semibold">{month}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 border-l-2 border-dashed border-ink-200 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">{event.category?.name}</Badge>
          {soldOut ? <Badge tone="danger">Sold out</Badge> : event.spots_remaining <= 10 && <Badge tone="warning">{event.spots_remaining} left</Badge>}
        </div>
        <h3 className="truncate text-lg font-bold group-hover:text-jacaranda-600">{event.title}</h3>
        <p className="flex items-center gap-1.5 text-sm text-ink-500">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{event.venue?.name} · {timeShort(event.event_time)}</span>
        </p>
        <p className="mt-auto font-display text-lg font-bold">{money(event.price)}</p>
      </div>
    </Link>
  );
}

export default function Home() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') || '');
  const debounced = useDebounced(search);
  const page = Number(params.get('page') || 1);
  const category = params.get('category_id') || '';
  const free = params.get('free') || '';
  const from = params.get('from') || '';
  const sort = params.get('sort') || 'date';

  const set = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  // Push the debounced search term into the URL.
  const applied = params.get('search') || '';
  useEffect(() => {
    if (debounced !== applied) set({ search: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const categories = useLoad(async () => unwrap(await api.get('/categories')).categories, []);
  const query = useMemo(
    () => ({ page, pageSize: 12, search: applied || undefined, category_id: category || undefined, free: free || undefined, from: from || undefined, sort }),
    [page, applied, category, free, from, sort],
  );
  const events = useLoad(async () => {
    const res = await api.get('/events', { params: query });
    return { list: unwrap(res).events, meta: metaOf(res) };
  }, [query]);

  const filtered = Boolean(applied || category || free || from);

  return (
    <div>
      <section className="mb-8">
        <h1 className="neon-text max-w-2xl text-4xl font-extrabold sm:text-5xl">What’s happening on campus</h1>
        <p className="mt-2 max-w-xl text-lg text-ink-500">Find an event, book your spot, and walk in with a QR ticket.</p>
      </section>

      <form role="search" onSubmit={(e) => e.preventDefault()} className="card mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative sm:col-span-2">
          <Input label="Search" type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Title or keyword" className="[&_input]:pl-9" hint="Searches event titles and descriptions." />
          <Search className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-ink-300" aria-hidden />
        </div>
        <Select label="Category" value={category} onChange={(e) => set({ category_id: e.target.value })}>
          <option value="">All categories</option>
          {categories.data?.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
        </Select>
        <Select label="Price" value={free} onChange={(e) => set({ free: e.target.value })}>
          <option value="">Free and paid</option>
          <option value="true">Free only</option>
          <option value="false">Paid only</option>
        </Select>
        <Input label="From date" type="date" value={from} onChange={(e) => set({ from: e.target.value })} />
        <Select label="Sort by" value={sort} onChange={(e) => set({ sort: e.target.value })} className="lg:col-start-5">
          <option value="date">Soonest first</option>
          <option value="price">Price</option>
          <option value="title">Title A–Z</option>
        </Select>
      </form>

      {events.loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading events">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-36 animate-pulse rounded-stub bg-ink-100" />)}
        </div>
      ) : events.error ? (
        <ErrorState message={events.error} onRetry={events.reload} />
      ) : events.data.list.length === 0 ? (
        <EmptyState icon={CalendarSearch} title={filtered ? 'No events match your filters' : 'No upcoming events yet'}
          text={filtered ? 'Try a different search, or clear the filters to see everything.' : 'Check back soon. New events are added all the time.'}
          action={filtered && <Button variant="secondary" onClick={() => { setSearch(''); setParams({}); }}>Clear filters</Button>} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {events.data.list.map((e) => <EventTicket key={e.event_id} event={e} />)}
          </div>
          <Pagination meta={events.data.meta} onPage={(p) => set({ page: String(p) })} />
        </>
      )}
    </div>
  );
}