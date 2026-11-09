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

  it('creates the fixed branch from the fetched SHA with force enabled', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ id: 'commit-sha' }),
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
    const project = {
      id: 11,
      projectSlug: 'group/payments',
      host: 'gitlab.example.com',
      repoUrl: 'https://gitlab.example.com/group/payments',
      defaultBranch: 'main',
    };

    await client.createCommit(
      project,
      'chore/template-update-service',
      'project-head-sha',
      'chore(template): update to 2.0.0',
      [],
    );

    expect('deleteBranch' in client).toBe(false);
    expect('createBranch' in client).toBe(false);
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({
      branch: 'chore/template-update-service',
      start_sha: 'project-head-sha',
      force: true,
      commit_message: 'chore(template): update to 2.0.0',
      actions: [],
    });
  });

  it('does not ask GitLab to remove the update branch after merge', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        iid: 9,
        web_url: 'https://gitlab.example.com/mr/9',
      }),
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

    await client.createMergeRequest(
      {
        id: 11,
        projectSlug: 'group/payments',
        host: 'gitlab.example.com',
        repoUrl: 'https://gitlab.example.com/group/payments',
        defaultBranch: 'main',
      },
      'chore/template-update-service',
      { title: 'template update', description: 'details' },
    );

    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(body.source_branch).toBe('chore/template-update-service');
    expect(body).not.toHaveProperty('remove_source_branch');
  });
});
