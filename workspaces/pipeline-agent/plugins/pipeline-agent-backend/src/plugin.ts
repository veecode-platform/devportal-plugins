import Anthropic from '@anthropic-ai/sdk';
import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import {
  PIPELINE_AGENT_PLUGIN_ID,
  PIPELINE_AGENT_ROUTES,
} from '@veecode-platform/backstage-plugin-pipeline-agent-common';
import { AnthropicRuntime } from './agente/real';
import { criarAutorizador } from './autorizacao';
import { type Configuracao, lerConfiguracao } from './configuracao';
import { GitLabFake } from './fake/gitlab';
import { AgenteFake } from './fake/agente';
import { GitLabHttp } from './gitlab/http';
import { createRouter } from './router';
import { criarServico, type Servico } from './servico';

// The test seam: "instantaneos" removes the pauses of the scripted agent and the
// GitLab fake, so the flow runs in milliseconds. The portal always uses the default.
export type OpcoesPlugin = { ritmo?: 'reais' | 'instantaneos' };

const PRAZO_PIPELINE_MS = 20 * 60_000;
const PERMISSOES_RBAC = '/.well-known/backstage/permissions/metadata';
const GITLAB_FAKE = 'https://gitlab.example.com';

function montarServico(
  cfg: Configuracao,
  instantaneo: boolean,
): Servico | undefined {
  const dormir = (ms: number): Promise<void> =>
    instantaneo
      ? Promise.resolve()
      : new Promise<void>(resolve => setTimeout(resolve, ms));
  if (cfg.modo === 'fake') {
    return criarServico({
      runtime: new AgenteFake({ esperar: dormir }),
      gitlabPara: projectSlug =>
        new GitLabFake(projectSlug, {
          duracaoPipelineMs: instantaneo ? 0 : 4000,
        }),
      gitlabBaseUrl: GITLAB_FAKE,
      agentId: 'agent_fake',
      environmentId: 'env_fake',
      ritmo: {
        intervaloPollMs: instantaneo ? 0 : 1000,
        prazoPollMs: PRAZO_PIPELINE_MS,
        dormir,
      },
    });
  }
  const real = cfg.real;
  if (!real) return undefined;
  return criarServico({
    runtime: new AnthropicRuntime(
      new Anthropic({ apiKey: real.anthropicApiKey }),
    ),
    gitlabPara: projectSlug =>
      new GitLabHttp({
        base: `${real.gitlabBaseUrl}/api/v4`,
        token: real.gitlabToken,
        projeto: projectSlug,
      }),
    gitlabBaseUrl: real.gitlabBaseUrl,
    agentId: real.agentId,
    environmentId: real.environmentId,
    ritmo: { intervaloPollMs: 5000, prazoPollMs: PRAZO_PIPELINE_MS, dormir },
  });
}

export function createPipelineAgentPlugin(opcoes: OpcoesPlugin = {}) {
  const instantaneo = opcoes.ritmo === 'instantaneos';
  return createBackendPlugin({
    pluginId: PIPELINE_AGENT_PLUGIN_ID,
    register(env) {
      env.registerInit({
        deps: {
          logger: coreServices.logger,
          config: coreServices.rootConfig,
          httpRouter: coreServices.httpRouter,
          httpAuth: coreServices.httpAuth,
          permissions: coreServices.permissions,
          catalog: catalogServiceRef,
        },
        async init({
          logger,
          config,
          httpRouter,
          httpAuth,
          permissions,
          catalog,
        }) {
          const cfg = lerConfiguracao(config);
          // Fails closed without taking the pod down: one warning, then 503 on every route.
          if (cfg.faltando.length > 0) {
            logger.warn(
              `pipeline-agent sem configuração obrigatória; as rotas respondem 503. Chaves ausentes: ${cfg.faltando.join(
                ', ',
              )}`,
            );
          }
          if (cfg.vinculosInvalidos > 0) {
            logger.warn(
              `pipeline-agent: ${cfg.vinculosInvalidos} entrada(s) de pipelineAgent.allowedProjects descartada(s) por formato inválido`,
            );
          }
          const servico =
            cfg.faltando.length === 0
              ? montarServico(cfg, instantaneo)
              : undefined;
          const autorizador = criarAutorizador({
            httpAuth,
            permissions,
            catalog,
            vinculos: cfg.vinculos,
          });

          httpRouter.use(
            createRouter({
              logger,
              autorizador,
              servico,
              chavesFaltando: cfg.faltando,
            }),
          );
          // Proof 2 probes the health route with plain curl, and RBAC reads the
          // permission metadata without a user: neither takes credentials.
          httpRouter.addAuthPolicy({
            path: PIPELINE_AGENT_ROUTES.health,
            allow: 'unauthenticated',
          });
          httpRouter.addAuthPolicy({
            path: PERMISSOES_RBAC,
            allow: 'unauthenticated',
          });
        },
      });
    },
  });
}

export const pipelineAgentPlugin = createPipelineAgentPlugin();
