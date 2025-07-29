import * as React from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Endpoint, FilterField, FilterParam, ParamDefinition, ParamType } from '@/schema/generateEndpoints';
import { buildFilterBody, FilterExpr, FilterOperator, FilterOperators } from '@/schema/streamQuery';
import * as client from '../hey';

interface EndpointAutocompleteProps {
  endpoints: Endpoint[];
}

export function EndpointAutocomplete({ endpoints }: EndpointAutocompleteProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = React.useState<Endpoint | null>(null);
  const [query, setQuery] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [response, setResponse] = React.useState<any>(null);
  const [error, setError] = React.useState<any>(null);

  // Field state
  const [fieldValues, setFieldValues] = React.useState<Record<string, string>>({});
  const [fieldOps, setFieldOps] = React.useState<Record<string, FilterOperator>>({});

  // Filtering
  const filteredEndpoints = React.useMemo(() => endpoints.filter(e => e.operationId.toLowerCase().includes(query.toLowerCase())), [query, endpoints]);

  const { pathQueryParams, filterFields, requiredFieldNames } = React.useMemo(() => {
    if (!selectedEndpoint) return { pathQueryParams: [] as ParamDefinition[], filterFields: [] as FilterField[], requiredFieldNames: [] as string[] };
    const pathQueryParams: ParamDefinition[] = [];
    const filterFields: FilterField[] = [];
    for (const p of selectedEndpoint.paramDefs) {
      if (p.in === ParamType.Path || p.in === ParamType.Query) {
        pathQueryParams.push(p);
      } else if (p.in === ParamType.Filter) {
        for (const f of (p as FilterParam).fields) {
          filterFields.push(f);
        }
      }
    }
    const requiredFieldNames: string[] = selectedEndpoint.paramDefs.filter(p => p.required).map(p => p.name);
    return { pathQueryParams, filterFields, requiredFieldNames };
  }, [selectedEndpoint]);

  const allReqFilled = requiredFieldNames.every(f => !!fieldValues[f]?.trim());

  const selectEndpoint = (ep: Endpoint) => {
    setSelectedEndpoint(ep);
    setFieldValues({});
    setFieldOps({});
    setOpen(false);
    setQuery(ep.operationId);
  };

  const handleSubmit = async () => {
    if (!selectedEndpoint) return;
    setSubmitting(true);
    setError(null);
    setResponse(null);
    const exprs: FilterExpr[] = filterFields
      .filter(f => fieldValues[f.path]?.trim())
      .map(f => ({
        fieldPath: f.path,
        op: fieldOps[f.path] || 'Eq',
        value: f.type === 'integer' || f.type === 'number' ? Number(fieldValues[f.path]) : fieldValues[f.path],
      }));
    const args: any = { throwOnError: false };
    if (selectedEndpoint.streaming) args.parseAs = 'stream';
    pathQueryParams.forEach(pd => {
      args[pd.in] = args[pd.in] || {};
      args[pd.in][pd.name] = fieldValues[pd.name];
    });
    if (exprs.length) args.body = buildFilterBody(exprs);
    const { data, response, error } = await (client as any)[selectedEndpoint.heyClientMethodName](args);
    setResponse(response);
    setError(error);
    setSubmitting(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
          {selectedEndpoint ? selectedEndpoint.operationId : query || 'Select operation...'}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput placeholder="Search operation..." value={query} onValueChange={setQuery} className="h-9" />
          <CommandList>
            <CommandEmpty>No endpoint found.</CommandEmpty>
            <CommandGroup>
              {filteredEndpoints.map(ep => (
                <CommandItem key={ep.operationId} value={ep.operationId} onSelect={() => selectEndpoint(ep)}>
                  {ep.operationId}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>

      {selectedEndpoint && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-4">
            {pathQueryParams!.map(p => (
              <div key={p.name} className="flex flex-col">
                <Label>{p.name}</Label>
                <Input
                  value={fieldValues[p.name] || ''}
                  placeholder={p.schema.examples?.[0]}
                  onChange={e => setFieldValues({ ...fieldValues, [p.name]: e.target.value })}
                />
              </div>
            ))}
          </div>

          {allReqFilled && filterFields!.length > 0 && (
            <div className="space-y-4">
              <div className="text-sm font-medium">Optional filters</div>
              {filterFields.map(f => (
                <div key={f.path} className="flex flex-col">
                  <Label>{f.path}</Label>
                  <div className="flex gap-2">
                    <Select value={fieldOps[f.path] || 'Eq'} onValueChange={o => setFieldOps({ ...fieldOps, [f.path]: o as FilterOperator })}>
                      <SelectTrigger className="w-24">
                        <SelectValue placeholder="Op" />
                      </SelectTrigger>
                      <SelectContent>
                        {FilterOperators.map(o => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={fieldValues[f.path] || ''}
                      placeholder={f.examples?.[0]}
                      onChange={e => setFieldValues({ ...fieldValues, [f.path]: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button onClick={handleSubmit} disabled={submitting || !allReqFilled} className="mt-4">
            {submitting ? 'Running...' : 'Run'}
          </Button>
          {error && <pre className="text-red-600 mt-2">{String(error)}</pre>}
          {response && <pre className="mt-2 whitespace-pre-wrap">{JSON.stringify(response.data ?? response, null, 2)}</pre>}
        </div>
      )}
    </Popover>
  );
}
