import { createBackend } from '@backstage/backend-defaults';
import { mockServices } from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import { githubWorkflowsServiceFactory } from '../src/services';

// This is the development setup for your plugin that wires up a
// minimal backend that can use both real and mocked plugins and services.
//
// Start up the backend by running `yarn start` in the package directory.
// Once it's up and running, try out the following requests:
//
// List workflows (replace owner/repo with actual values):
//
//   curl "http://localhost:7007/api/github-workflow-backend/workflows?hostname=github.com&githubRepoSlug=owner/repo&branch=main"
//
// List branches:
//
//   curl "http://localhost:7007/api/github-workflow-backend/branches?hostname=github.com&githubRepoSlug=owner/repo"
//
// Get default branch:
//
//   curl "http://localhost:7007/api/github-workflow-backend/default-branch?hostname=github.com&githubRepoSlug=owner/repo"

// Note: When running in isolation, this will load app-config.yaml from the current directory
// Make sure your plugin's app-config.yaml has the GitHub integration configured
const backend = createBackend();

// Mocking the auth and httpAuth service allows you to call your plugin API without
// having to authenticate.
//
// If you want to use real auth, you can install the following instead:
//   backend.add(import('@backstage/plugin-auth-backend'));
//   backend.add(import('@backstage/plugin-auth-backend-module-guest-provider'));
backend.add(mockServices.auth.factory());
backend.add(mockServices.httpAuth.factory());

// Rather than using a real catalog you can use a mock with a fixed set of entities.
backend.add(
  catalogServiceMock.factory({
    entities: [
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'sample',
          title: 'Sample Component',
        },
        spec: {
          type: 'service',
        },
      },
    ],
  }),
);

// Add the service factory before the plugin
backend.add(githubWorkflowsServiceFactory);

// Add the plugin
backend.add(import('../src'));

backend.start();
