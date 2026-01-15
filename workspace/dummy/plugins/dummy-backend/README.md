# plugin-dummy-backend

The dummy backend plugin (`@veecode-platform/backstage-plugin-dummy-backend`) provides a simple demonstration of backend plugin functionality in Backstage. It serves as a test implementation for showcasing plugin loading, error handling, and integration patterns.

## Core Features

- **HTTP API Endpoint**: Exposes a REST endpoint at `/teams` that returns soccer team data
- **Service Architecture**: Implements a `SoccerListService` using Backstage's service factory pattern
- **Logging Integration**: Uses Backstage's core logger service for structured logging
- **Static and Dynamic plugins**: this plugin is available both as static and dynamic plugin

## Technical Implementation

- Built with Backstage's new backend plugin API (`@backstage/backend-plugin-api`)
- Uses Express.js with `express-promise-router` for HTTP routing
- Implements a service reference (`soccerListServiceRef`) with dependency injection
- Returns static mock data for 5 soccer teams (Arsenal, Barcelona, Bayern, Flamengo, Juventus)

## API Response

```json
{
  "teams": [
    { "id": "arsenal", "name": "Arsenal", "country": "England" },
    { "id": "barcelona", "name": "FC Barcelona", "country": "Spain" },
    { "id": "bayern", "name": "FC Bayern München", "country": "Germany" },
    { "id": "flamengo", "name": "Flamengo", "country": "Brazil" },
    { "id": "juventus", "name": "Juventus", "country": "Italy" }
  ]
}
```

This plugin serves as a reference implementation for backend plugin patterns and API development in Backstage applications.

## Static Plugin Wiring

### Installation

This plugin is installed via the `@veecode-platform/backstage-plugin-dummy-backend` package. To install it to your backend package, run the following command:

```bash
# From your root directory
yarn --cwd packages/backend add @veecode-platform/backstage-plugin-dummy-backend
```

### Adding the Plugin to the Backend

Add the plugin to your backend in `packages/backend/src/index.ts`:

```ts
const backend = createBackend();
// ...
backend.add(import('@veecode-platform/backstage-plugin-dummy-backend'));
```

## Dynamic Plugin Wiring

TODO: show dynamic plugin wiring for backend.

## Development

This plugin backend can be started in a standalone mode from directly in this
package with `yarn start`. It is a limited setup that is most convenient when
developing the plugin backend itself.

If you want to run the entire project, including the frontend, run `yarn start` from the root directory.
