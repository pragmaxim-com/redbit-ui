import { useEffect, useState, useRef, JSX } from 'react';
import { consumeStream } from '@/stream/streamingClient';
import * as client from '../hey';

export function StreamingTable({ heyClientMethodName, args, onStart, onError, onComplete }: {
  heyClientMethodName: string,
  args: Record<string, any>,
  onStart?: () => void,
  onError?: (error: Error) => void,
  onComplete?: () => void,
}) {
  const [rowElements, setRowElements] = useState<JSX.Element[]>([]);
  const headersRef = useRef<string[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const idxRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    onStart?.();
    ((client as any)[heyClientMethodName](args) as Promise<void>)
      .then(({ data, response, error }: any) => {
        if (!data || data.locked) throw new Error('Streaming failed');
        if (error) {
          onError?.(error);
          return;
        }
        return consumeStream(
          data,
          (row: Record<string, any>) => {
            const idx = idxRef.current++;
            if (headersRef.current === null) {
              headersRef.current = Object.keys(row);
            }
            console.log(JSON.stringify(row, null, 2));
            const tr = (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                {Object.values(row).map((val, j) => (
                  <td key={j} className="px-4 py-2 border">
                    {String(val)}
                  </td>
                ))}
              </tr>
            );

            setRowElements(prev => [...prev, tr]);
          },
          onError,
          onComplete,
          controller.signal,
        );
      })
      .catch(err => {
        onError?.(err);
      });

    return () => {
      abortRef.current?.abort();
    };
  }, [heyClientMethodName, args]);

  return (
    <table className="min-w-full border-collapse">
      <thead>
      <tr>
        {headersRef.current?.map(header => (
          <th key={header} className="px-4 py-2 border">
            {header}
          </th>
        ))}
      </tr>
      </thead>
      <tbody>{rowElements}</tbody>
    </table>
  );
}
