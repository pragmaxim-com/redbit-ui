import { useEffect, useState } from 'react';
import { fetchSchema, SchemaMap } from './schema/schema';
import { EndpointAutocomplete } from './components/EndpointAutocomplete';
import { generateEndpoints } from '@/schema/generateEndpoints';

export default function App() {
  const [openapi, setOpenapi] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      const openapi = await fetchSchema('http://127.0.0.1:8000/apidoc/openapi.json');
      setOpenapi(openapi);
    })();
  }, []);

  if (!openapi) return <div>Loading...</div>;
  const realDefs: SchemaMap = openapi.components?.schemas as any;
  const endpoints = generateEndpoints(openapi.paths!, realDefs);

  return (
    <div className="max-w-2xl mx-auto py-10">
      <EndpointAutocomplete endpoints={Object.values(endpoints)} />
    </div>
  );
}
