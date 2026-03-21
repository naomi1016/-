import { useState, useEffect } from 'react';

export interface AvailabilityData {
  total:         number;
  onShelf:       number;
  checkedOut:    number;
  other:         number;
  recentDueDate: string;
  branches:      Record<string, number>; // siteCode → 在架本數
}

type Status = 'idle' | 'loading' | 'ok' | 'error';

const cache = new Map<string, AvailabilityData>();

export function useAvailability(bibId: string | undefined, enabled: boolean) {
  const [data,   setData]   = useState<AvailabilityData | null>(null);
  const [status, setStatus] = useState<Status>('idle');

  useEffect(() => {
    if (!enabled || !bibId) {
      setData(null);
      setStatus('idle');
      return;
    }

    if (cache.has(bibId)) {
      setData(cache.get(bibId)!);
      setStatus('ok');
      return;
    }

    setStatus('loading');
    setData(null);

    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`/api/availability?bibId=${bibId}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: AvailabilityData = await res.json();
        cache.set(bibId, json);
        setData(json);
        setStatus('ok');
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setStatus('error');
      }
    })();

    return () => controller.abort();
  }, [bibId, enabled]);

  return { data, status };
}
