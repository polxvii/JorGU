import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../account/api';
import type { Cached } from '../account/cache';

export interface LoadState<T> {
  data?: T;
  stale: boolean;
  loading: boolean;
  error: string | null;
}

/** Loads once on mount (cache first); `reload()` forces a network refresh. `load` must be stable. */
export function useLoad<T>(load: (force: boolean) => Promise<Cached<T>>): LoadState<T> & { reload: () => void } {
  const [state, setState] = useState<LoadState<T>>({ stale: false, loading: true, error: null });
  const seq = useRef(0);

  const fetchNow = useCallback(
    (force: boolean) => {
      const my = ++seq.current;
      load(force).then(
        (r) => {
          if (my === seq.current) setState({ data: r.data, stale: r.stale, loading: false, error: null });
        },
        (e: unknown) => {
          if (my === seq.current) setState((s) => ({ ...s, loading: false, error: e instanceof ApiError ? e.code : 'HTTP' }));
        },
      );
    },
    [load],
  );

  useEffect(() => {
    fetchNow(false);
    return () => {
      seq.current += 1;
    };
  }, [fetchNow]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchNow(true);
  }, [fetchNow]);

  return { ...state, reload };
}
