import {
  mockCredentials,
  mockServices,
  startTestBackend,
} from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import request from 'supertest';
import { createPipelineAgentPlugin } from './plugin';

type DadosConfig = NonNullable<
  Parameters<typeof mockServices.rootConfig.factory>[0]
>['data'];

const AUTH = {
  authorization: mockCredentials.user.header('user:default/alice'),
};
const REAL_SEM_CHAVES: DadosConfig = {
  pipelineAgent: {
    mode: 'real',
    allowedProjects: [
      {
        project: 'veecode-demos/pedidos-api',
        entityRef: 'component:default/pedidos-api',
      },
    ],
  },
};

async function backend(data?: DadosConfig) {
  const { server } = await startTestBackend({
    features: [
      createPipelineAgentPlugin({ ritmo: 'instantaneos' }),
      ...(data ? [mockServices.rootConfig.factory({ data })] : []),
      catalogServiceMock.factory({ entities: [] }),
      mockServices.httpAuth.factory({
        defaultCredentials: mockCredentials.none(),
      }),
    ],
  });
  return server;
}

describe('pipeline agent plugin', () => {
  it('answers the health check without credentials in fake mode', async () => {
    const res = await request(await backend()).get(
      '/api/pipeline-agent/health',
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('starts in real mode without keys, keeps health at 200, and answers 503 naming only the missing keys', async () => {
    const app = await backend(REAL_SEM_CHAVES);
    const saude = await request(app).get('/api/pipeline-agent/health');
    expect(saude.status).toBe(200);

    const res = await request(app)
      .get(
        '/api/pipeline-agent/project?entityRef=component:default/pedidos-api',
      )
      .set(AUTH);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      erro: 'não configurado: pipelineAgent.anthropic.apiKey, pipelineAgent.agentId, pipelineAgent.environmentId, pipelineAgent.gitlab.token',
    });
  });

  it('exposes the permission metadata to RBAC without credentials', async () => {
    const res = await request(await backend()).get(
      '/api/pipeline-agent/.well-known/backstage/permissions/metadata',
    );
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain(
      'pipeline-agent.investigation.create',
    );
    expect(JSON.stringify(res.body)).toContain(
      'pipeline-agent.investigation.approve',
    );
  });
});
