import { createBackend } from '@backstage/backend-defaults';
import { mockServices } from '@backstage/backend-test-utils';

const backend = createBackend();

backend.add(mockServices.auth.factory());
backend.add(mockServices.httpAuth.factory());

backend.add(import('../src'));

backend.start().then(() => {
  const port = process.env.PORT ?? '7007';
  const base = `http://localhost:${port}/api/about`;

  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      '✨ About backend is running!',
      '',
      'Try it out:',
      `  curl ${base}/info | jq`,
      '',
    ].join('\n'),
  );
});
