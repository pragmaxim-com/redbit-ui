import * as React from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  buildFullRequest,
  Endpoint,
  extractParamsAndFields,
  FilterField,
  ParamDefinition,
  PathQueryParamValues,
} from '@/schema/generateEndpoints';
import { buildFilterBody, buildFilterExpr, FilterExpr, FilterOperator, FilterOperators } from '@/schema/streamQuery';
import * as client from '../hey';

interface EndpointAutocompleteProps {
  endpoints: Endpoint[];
}

export function EndpointAutocomplete({ endpoints }: EndpointAutocompleteProps) {
  const [open, setOpen] = React.useState(true);
  const [selectedEndpoint, setSelectedEndpoint] = React.useState<Endpoint | null>(null);
  const [query, setQuery] = React.useState('');

  // Submission state
  const [submitting, setSubmitting] = React.useState(false);
  const [response, setResponse] = React.useState<any>(null);
  const [error, setError] = React.useState<any>(null);

  // Field state
  const [fieldValues, setFieldValues] = React.useState<Record<string, string>>({});
  const [fieldOps, setFieldOps] = React.useState<Record<string, FilterOperator>>({});

  // Filtering
  const filteredEndpoints = React.useMemo(() => endpoints.filter(e => e.operationId.toLowerCase().includes(query.toLowerCase())), [query, endpoints]);

  const { pathQueryParams, filterFields, requiredFieldNames } = React.useMemo(() => {
    if (!selectedEndpoint)
      return { pathQueryParams: [] as ParamDefinition[], filterFields: [] as FilterField[], requiredFieldNames: [] as string[] };
    else
      return extractParamsAndFields(selectedEndpoint!);
  }, [selectedEndpoint]);

  // Initialize default operator 'Eq' for all filter fields
  React.useEffect(() => {
    if (filterFields) {
      setFieldOps(prev => {
        const next = { ...prev };
        filterFields.forEach(f => {
          if (!next[f.path]) next[f.path] = 'Eq';
        });
        return next;
      });
    }
  }, [filterFields]);

  const allReqFilled = requiredFieldNames.every(f => !!fieldValues[f]?.trim());

  const selectEndpoint = (ep: Endpoint) => {
    setOpen(false);
    setSelectedEndpoint(ep);
    setQuery(ep.operationId);
    setFieldValues({});
    setFieldOps({});
    setSubmitting(false);
    setResponse(null);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!selectedEndpoint) return;
    setSubmitting(true);
    setError(null);
    setResponse(null);
    const exprs: FilterExpr[] = filterFields
      .filter(f => fieldValues[f.path]?.trim())
      .map(f => buildFilterExpr(f, fieldOps[f.path], fieldValues[f.path]));
    const body = exprs.length ? buildFilterBody(exprs) : undefined;
    const pathQueryParamValues: PathQueryParamValues[] = pathQueryParams.map(pd => [pd.in, pd.name, fieldValues[pd.name]]);
    const args: Record<string, any> = buildFullRequest(selectedEndpoint.streaming, pathQueryParamValues, body);
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
                    <Select value={fieldOps[f.path]} onValueChange={o => setFieldOps({ ...fieldOps, [f.path]: o as FilterOperator })}>
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
