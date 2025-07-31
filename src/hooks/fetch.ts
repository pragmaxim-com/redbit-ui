import { useEffect, useRef, useState } from 'react';
import * as client from '../hey';
import { consumeStream } from '@/stream/streamingClient';

export function useFetch(
  heyClientMethodName: string,
  args: Record<string, any>,
  streaming: boolean,
  onStart?: () => void,
  onError?: (error: Error) => void,
  onComplete?: () => void
) {
  const [rowsData, setRowsData] = useState<Record<string, any>[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    onStart?.();

    (async () => {
      try {
        const { data, error } = await (client as any)[heyClientMethodName](args);
        if (error) {
          onError?.(error);
          return;
        }

        if (streaming) {
          if (!data || data.locked) {
            onError?.(Error('Data stream locked or not available'));
            return;
          }
          await consumeStream(
            data,
            (row: Record<string, any>) => setRowsData(prev => [...prev, row]),
            onError,
            onComplete,
            controller.signal
          );
        } else {
          setRowsData(Array.isArray(data) ? data : [data]);
          onComplete?.();
        }
      } catch (err: any) {
        onError?.(err);
      }
    })();

    return () => controller.abort();
  }, [heyClientMethodName, args, streaming]);

  return rowsData;
}
