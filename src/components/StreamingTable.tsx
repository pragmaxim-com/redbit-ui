import { useEffect, useState, useRef } from 'react';
import { consumeStream } from '@/stream/streamingClient';
import * as client from '../hey';
import type { ResponseBody } from '@/schema/generateEndpoints';
import { buildFieldTreeFromRootSchema, expandSchemaObjectFields, SchemaField } from '@/schema/schemaTable';
import {
  Table,
  TableCaption,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

interface StreamingTableProps {
  responseBody: ResponseBody;
  heyClientMethodName: string;
  args: Record<string, any>;
  onStart?: () => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

interface ViewLevel {
  rows: Record<string, any>[];
  schema: Record<string, SchemaField>;
  label: string;
}

export function StreamingTable(
  { responseBody, heyClientMethodName, args, onStart, onError, onComplete }: StreamingTableProps
) {
  const [rowsData, setRowsData] = useState<Record<string, any>[]>([]);
  const [viewStack, setViewStack] = useState<ViewLevel[]>([]);
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
        if (!data || data.locked) throw new Error('Streaming failed');

        await consumeStream(
          data,
          (row: Record<string, any>) => setRowsData(prev => [...prev, row]),
          err => onError?.(err),
          onComplete,
          controller.signal
        );

        onComplete?.();
      } catch (err: any) {
        onError?.(err);
      }
    })();

    return () => controller.abort();
  }, [heyClientMethodName, args]);

  useEffect(() => {
    if (rowsData.length && viewStack.length === 0) {
      const rootSchemaTree: Record<string, SchemaField> = buildFieldTreeFromRootSchema(responseBody.schema);
      setViewStack([
        {
          rows: rowsData,
          schema: expandSchemaObjectFields(rootSchemaTree, '', true),
          label: 'root',
        },
      ]);
    }
  }, [rowsData]);

  const current = viewStack[viewStack.length - 1];
  if (!current) return <div>Loading...</div>;

  function handleCellClick(value: any, field: SchemaField) {
    if (field.type === 'array' && Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
      const itemSchema = field.children ?? {};
      const flatChildSchema = expandSchemaObjectFields(itemSchema);
      setViewStack(stack => [...stack, { rows: value, schema: flatChildSchema, label: field.name }]);
    }
  }

  function handleBack() {
    setViewStack(stack => stack.slice(0, -1));
  }

  const headers = Object.keys(current.schema).sort((a, b) => {
    const aXKey = current.schema[a].xKey ? 0 : 1;
    const bXKey = current.schema[b].xKey ? 0 : 1;
    return aXKey - bXKey;
  });

  return (
    <div className="w-full rounded-md border">
      {viewStack.length > 1 && (
        <button
          onClick={handleBack}
          className="mb-2 px-2 py-1 bg-blue-500 text-white rounded"
          aria-label="Back to previous table"
        >
          ← Back
        </button>
      )}
      <Table className="w-full table-auto">
        <TableCaption>Viewing: {current.label}</TableCaption>
        <TableHeader>
          <TableRow>
            {headers.map(header => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {current.rows.map((row, rowIdx) => (
            <TableRow key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
              {headers.map((header, colIdx) => {
                const field = current.schema[header];
                const value = header.split('.').reduce((acc, part) => acc?.[part], row);

                if (field.type === 'array') {
                  if (!Array.isArray(value) || value.length === 0) {
                    return <TableCell key={colIdx} className="text-center">0</TableCell>;
                  }
                  return (
                    <TableCell
                      key={colIdx}
                      onClick={() => handleCellClick(value, field)}
                      className="cursor-pointer text-blue-600"
                    >
                      {value.length}
                    </TableCell>
                  );
                }

                return <TableCell key={colIdx}>{value != null ? String(value) : ''}</TableCell>;
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
