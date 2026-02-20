import { createBackend } from '@backstage/backend-defaults';
import { mockServices } from '@backstage/backend-test-utils';

// Start up the backend by running `yarn start` in the package directory.
//
// curl examples:
//   curl http://localhost:7007/api/kong-service-manager-backend/health
//   curl http://localhost:7007/api/kong-service-manager-backend/default/plugins

if (!process.env.KONG_ADMIN_URL) {
  process.env.KONG_ADMIN_URL = 'http://localhost:8001';
  // eslint-disable-next-line no-console
  console.warn('KONG_ADMIN_URL not set, defaulting to http://localhost:8001');
}
if (!process.env.KONG_ADMIN_TOKEN) {
  // eslint-disable-next-line no-console
  console.warn('KONG_ADMIN_TOKEN not set, requests may fail if Kong requires auth');
}

function printCurlHelp() {
  const host = process.env.HOST ?? 'localhost';
  const port = process.env.PORT ?? '7007';
  const base = `http://${host}:${port}/api/kong-service-manager-backend`;

  // eslint-disable-next-line no-console
  console.log(`\nCurl tests:\n  curl ${base}/health\n  curl ${base}/default/plugins\n`);
}

const backend = createBackend();

backend.add(mockServices.auth.factory());
backend.add(mockServices.httpAuth.factory());

// Provide kong.instances config via env vars or override here for local dev.
// By default reads from app-config.yaml in the workspace root.
backend.add(import('../src'));

backend.start().then(
  () => {
    printCurlHelp();
  },
  () => {
    // If startup fails, Backstage will already log the error.
  },
);
