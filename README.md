The [hey-api](https://github.com/hey-api/openapi-ts) base client library and abilities of this UI are derived
from the [redbit](http://github.com/pragmaxim-com/redbit) openAPI specification.

### Development

Start the [redbit](http://github.com/pragmaxim-com/redbit) server so it serves the http://localhost:8000/apidoc/openapi.json and :

```
./bin/build.sh   # installs deps and builds the typescript client from openapi spec
npm run test     # runs tests and executes requests to all http endpoints
```
