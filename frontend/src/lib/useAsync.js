import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './api';

/**
 * Loads data when the component mounts (or `deps` change).
 * Returns { data, loading, error, reload }. Ignores answers that arrive after unmount.
 */
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const alive = useRef(true);
  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    return fn()
      .then((data) => alive.current && setState({ data, loading: false, error: '' }))
      .catch((e) => alive.current && setState({ data: null, loading: false, error: errorMessage(e) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    alive.current = true;
    run();
    return () => { alive.current = false; };
  }, [run]);
  return { ...state, reload: run };
}

/**
 * Wraps a submit handler so it cannot run twice at once (double-click safe).
 * `const [busy, submit] = useSubmit(async () => {...})`
 */
export function useSubmit(handler) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const submit = useCallback(
    async (...args) => {
      if (lock.current) return undefined;
      lock.current = true;
      setBusy(true);
      try {
        return await handler(...args);
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [handler],
  );
  return [busy, submit];
}

/** Debounces a fast-changing value (search boxes). */
export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
