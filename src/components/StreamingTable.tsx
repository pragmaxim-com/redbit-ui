import { useEffect, useState } from 'react';
import type { Endpoint } from '@/schema/generateEndpoints';
import { buildFieldTreeFromRootSchema, expandSchemaObjectFields, SchemaField } from '@/schema/schemaTable';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableCaption,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableFooter,
} from '@/components/ui/table';
import { useFetch } from '@/hooks/fetch';
import { ArrowLeft } from 'lucide-react';

interface StreamingTableProps {
  endpoint: Endpoint;
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

export function StreamingTable({ endpoint, args, onStart, onError, onComplete }: StreamingTableProps) {
  const [viewStack, setViewStack] = useState<ViewLevel[]>([]);
  const rowsData = useFetch(endpoint.heyClientMethodName, args, endpoint.streaming, onStart, onError, onComplete);

  useEffect(() => {
    if (rowsData.length && viewStack.length === 0) {
      const schemaDef = endpoint.responseBodies[200]!.schema;
      const effectiveSchema = schemaDef.type === 'array' ? schemaDef.items : schemaDef;
      const rootSchemaTree: Record<string, SchemaField> = buildFieldTreeFromRootSchema(effectiveSchema);
      setViewStack([
        {
          rows: rowsData,
          schema: expandSchemaObjectFields(rootSchemaTree, '', true),
          label: endpoint.operationId.split('_')[0] + 's',
        },
      ]);
    }
  }, [rowsData]);

  // Keyboard shortcut Alt+Left
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowLeft' && viewStack.length > 1) {
        e.preventDefault();
        e.stopPropagation();
        handleBack();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [viewStack]);

  const current = viewStack[viewStack.length - 1];
  const previous = viewStack[viewStack.length - 2];
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
      <Table className="w-full table-auto">
        <TableCaption className="text-center">
          {previous ? `${previous.label} / ${current.label}` : current.label}
        </TableCaption>
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
                  const count = Array.isArray(value) ? value.length : 0;
                  return (
                    <TableCell key={colIdx} className="text-center">
                      {count > 0 ? (
                        <Button variant="ghost" size="sm" onClick={() => handleCellClick(value, field)} className="text-blue-600 hover:bg-blue-50 focus:ring-blue-200">
                          {count}
                        </Button>
                      ) : (
                        0
                      )}
                    </TableCell>
                  );
                }

                return <TableCell key={colIdx}>{value != null ? String(value) : ''}</TableCell>;
              })}
            </TableRow>
          ))}
        </TableBody>

        {viewStack.length > 1 && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={headers.length}>
                <Button variant="outline" size="sm" onClick={handleBack}>
                  <ArrowLeft>Alt</ArrowLeft>
                </Button>
              </TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}
