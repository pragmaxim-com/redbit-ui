The [hey-api](https://github.com/hey-api/openapi-ts) base client library and abilities of this UI are derived
from the [redbit](http://github.com/pragmaxim-com/redbit) openAPI specification.

### Development

Start the [redbit](http://github.com/pragmaxim-com/redbit) server so it serves the http://localhost:8000/apidoc/openapi.json and :

```
npm install
npm run openapi:generate  # generates the openapi-ts client library from the redbit server
npm run test              # runs tests and executes requests to all http endpoints
npm run dev               # starts the development server
```
