import { createBackend } from '@backstage/backend-defaults';
import { mockServices } from '@backstage/backend-test-utils';

// TEMPLATE NOTE:
// This is the development setup for your plugin that wires up a
// minimal backend that can use both real and mocked plugins and services.
//
// Start up the backend by running `yarn start` in the package directory.
// Once it's up and running, try out the following requests:
//
// Fetch soccer teams:
//
//   curl http://localhost:7007/api/plugin-dummy-backend/teams

function printCurlHelp() {
	const host = process.env.HOST ?? 'localhost';
	const port = process.env.PORT ?? '7007';
	const baseUrl = `http://${host}:${port}`;
	const url = `${baseUrl}/api/plugin-dummy-backend/teams`;

	// Keep this as plain console output so it stands out
	// in the `backstage-cli package start` logs.
	// eslint-disable-next-line no-console
	console.log(`\nCurl test:\n  curl ${url}\n`);
}

const backend = createBackend();

// TEMPLATE NOTE:
// Mocking the auth and httpAuth service allows you to call your plugin API without
// having to authenticate.
//
// If you want to use real auth, you can install the following instead:
//   backend.add(import('@backstage/plugin-auth-backend'));
//   backend.add(import('@backstage/plugin-auth-backend-module-guest-provider'));
backend.add(mockServices.auth.factory());
backend.add(mockServices.httpAuth.factory());

backend.add(import('../src'));

backend.start().then(
	() => {
		printCurlHelp();
	},
	() => {
		// If startup fails, Backstage will already log the error.
	},
);
