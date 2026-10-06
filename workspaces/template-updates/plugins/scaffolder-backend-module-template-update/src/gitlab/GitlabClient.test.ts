import { ConfigReader } from '@backstage/config';
import { ScmIntegrations } from '@backstage/integration';
import { GitlabClient } from './GitlabClient';

describe('GitlabClient', () => {
  it('resolves a slash-containing tag through the commits API to a SHA', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{ id: 'resolved-commit-sha' }],
      text: async () => '',
      headers: new Headers(),
    })) as unknown as jest.MockedFunction<typeof fetch>;
    const integrations = ScmIntegrations.fromConfig(
      new ConfigReader({
        integrations: {
          gitlab: [
            {
              host: 'gitlab.example.com',
              token: 'test-token',
              apiBaseUrl: 'https://gitlab.example.com/api/v4',
            },
          ],
        },
      }),
    );
    const client = new GitlabClient(integrations, fetchImpl);

    await expect(
      client.resolveCommitSha(
        'https://gitlab.example.com/group/catalog',
        'service/v1.2.3',
      ),
    ).resolves.toBe('resolved-commit-sha');
    expect(String(fetchImpl.mock.calls[0][0])).toContain(
      'ref_name=service%2Fv1.2.3',
    );
  });
});
