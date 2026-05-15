import { createBackend } from '@backstage/backend-defaults';
import { mockServices } from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import { mockGithubWorkflowsServiceFactory } from '../src/services';

// Development setup — uses mock service so no GitHub credentials are needed.
//
// Start up the backend by running `yarn start` in the package directory.

function printCurlHelp() {
  const host = process.env.HOST || 'localhost';
  const port = process.env.PORT || '7007';
  const base = `http://${host}:${port}/api/github-workflow-backend`;
  const qs = 'hostname=github.com&githubRepoSlug=owner/repo';

  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      'Curl tests:',
      `  curl "${base}/workflows?${qs}&branch=main"`,
      `  curl "${base}/branches?${qs}"`,
      `  curl "${base}/default-branch?${qs}"`,
      `  curl "${base}/jobs?${qs}&id=5001"`,
      `  curl "${base}/workflow-run?${qs}&runId=5001"`,
      `  curl "${base}/download-logs?${qs}&jobId=8001"`,
      `  curl "${base}/environments?${qs}"`,
      '',
    ].join('\n'),
  );
}

const backend = createBackend();

backend.add(mockServices.auth.factory());
backend.add(mockServices.httpAuth.factory());

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

// Use mock service — returns fixture data, no GitHub credentials needed
backend.add(mockGithubWorkflowsServiceFactory);

// Add the plugin
backend.add(import('../src'));

backend.start().then(
  () => {
    printCurlHelp();
  },
  () => {
    // If startup fails, Backstage will already log the error.
  },
);
