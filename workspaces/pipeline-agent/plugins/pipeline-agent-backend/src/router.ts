import type { LoggerService } from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import { createPermissionIntegrationRouter } from '@backstage/plugin-permission-node';
import {
  type DetalheHistorico,
  type FaseResposta,
  type IniciarResposta,
  PIPELINE_AGENT_ROUTES,
  pipelineAgentInvestigationApprovePermission,
  pipelineAgentInvestigationCreatePermission,
  pipelineAgentPermissions,
} from '@veecode-platform/backstage-plugin-pipeline-agent-common';
import express from 'express';
import type { Autorizador } from './autorizacao';
import { normalizarEntityRef } from './entidade';
import { statusDoErro } from './erros';
import { GitLabError } from './gitlab/types';
import type { Servico } from './servico';

// The contract routes of PIPELINE_AGENT_ROUTES. Paths and bodies come from the common
// package, so the frontend and the backend cannot drift apart.
//
// Authorization: starting an investigation, and reading its events, its history (the list
// and one item) and its project banner, all need pipeline-agent.investigation.create on
// the entity: whoever may use the agent on an entity may watch it. Decisions need the
// approve permission.

const INTERVALO_BATIMENTO_MS = 15_000;
const TAMANHO_MAX_TOOL_USE_ID = 200;
const TAMANHO_MAX_MOTIVO = 500;
const TAMANHO_MAX_TEXTO = 2000;
// A session id is one path segment of the Managed Agents API: no slash, no dots.
const FORMATO_ID_SESSAO = /^[A-Za-z0-9_-]{1,200}$/;

export type DepsRouter = {
  logger: LoggerService;
  autorizador: Autorizador;
  // Undefined when real mode lacks keys: every contract route then answers 503.
  servico?: Servico;
  chavesFaltando: string[];
};

function campo(corpo: unknown, nome: string): unknown {
  return typeof corpo === 'object' && corpo !== null
    ? (corpo as Record<string, unknown>)[nome]
    : undefined;
}

function textoObrigatorio(valor: unknown, nome: string, max: number): string {
  if (typeof valor !== 'string' || valor.trim() === '')
    throw new InputError(`${nome} é obrigatório`);
  if (valor.length > max)
    throw new InputError(`${nome} passa de ${max} caracteres`);
  return valor.trim();
}

function textoDaQuery(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

function idDaSessao(valor: string): string {
  if (!FORMATO_ID_SESSAO.test(valor))
    throw new InputError('id da investigação inválido');
  return valor;
}

function nomeDoErro(erro: unknown): string {
  return erro instanceof Error ? erro.name : 'desconhecido';
}

type Handler = (req: express.Request, res: express.Response) => Promise<void>;
const rota =
  (fn: Handler): express.RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

// Opens the stream after the caller is authorized: 200, the SSE headers, and a first
// comment line so the proxy sends bytes at once. No compression: the no-transform
// directive and X-Accel-Buffering keep it unbuffered.
function abrirSse(res: express.Response): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(': conectado\n\n');
}

export function createRouter(deps: DepsRouter): express.Router {
  const { logger, autorizador, servico } = deps;
  const router = express.Router();
  router.use(express.json({ limit: '64kb' }));

  // Unauthenticated health check, for the probes of the portal.
  router.get(PIPELINE_AGENT_ROUTES.health, (_req, res) => {
    res.json({ status: 'ok' });
  });

  // RBAC lists the permissions from this router.
  router.use(
    createPermissionIntegrationRouter({
      permissions: pipelineAgentPermissions,
    }),
  );

  if (!servico) {
    const corpo = {
      erro: `não configurado: ${deps.chavesFaltando.join(', ')}`,
    };
    router.use((_req, res) => {
      res.status(503).json(corpo);
    });
    router.use(errorHandler(logger));
    return router;
  }

  router.post(
    PIPELINE_AGENT_ROUTES.investigations,
    rota(async (req, res) => {
      const credenciais = await autorizador.credenciais(req);
      const entityRef = normalizarEntityRef(campo(req.body, 'entityRef') ?? '');
      const alvo = await autorizador.entidade(
        credenciais,
        entityRef,
        pipelineAgentInvestigationCreatePermission,
      );
      const investigacao = await servico.iniciar(alvo);
      const corpo: IniciarResposta = {
        id: investigacao.id,
        iniciadoEm: new Date(investigacao.iniciadoEm).toISOString(),
      };
      res.status(201).json(corpo);
    }),
  );

  router.get(
    PIPELINE_AGENT_ROUTES.investigationEvents,
    rota(async (req, res) => {
      const credenciais = await autorizador.credenciais(req);
      const investigacao = servico.investigacao(req.params.id);
      // Against the investigation's own entity: the caller cannot name another one.
      await autorizador.entidade(
        credenciais,
        investigacao.entityRef,
        pipelineAgentInvestigationCreatePermission,
      );
      abrirSse(res);

      const ultimo = Number(req.get('last-event-id') ?? '-1');
      const desde = Number.isInteger(ultimo) && ultimo >= 0 ? ultimo + 1 : 0;
      let fechada = false;
      let cancelarOuvir = (): void => undefined;
      const batimento = setInterval(
        () => res.write(': ping\n\n'),
        INTERVALO_BATIMENTO_MS,
      );
      const fechar = (): void => {
        if (fechada) return;
        fechada = true;
        clearInterval(batimento);
        cancelarOuvir();
        res.end();
      };
      res.on('close', fechar);

      cancelarOuvir = investigacao.ouvir(desde, (indice, evento) => {
        if (!fechada)
          res.write(`id: ${indice}\ndata: ${JSON.stringify(evento)}\n\n`);
      });
      if (fechada) cancelarOuvir();
      else if (investigacao.encerrada) fechar();
    }),
  );

  router.post(
    PIPELINE_AGENT_ROUTES.aprovar,
    rota(async (req, res) => {
      const credenciais = await autorizador.credenciais(req);
      const investigacao = servico.investigacao(req.params.id);
      await autorizador.entidade(
        credenciais,
        investigacao.entityRef,
        pipelineAgentInvestigationApprovePermission,
      );
      const toolUseId = textoObrigatorio(
        campo(req.body, 'toolUseId'),
        'toolUseId',
        TAMANHO_MAX_TOOL_USE_ID,
      );
      await investigacao.aprovar(toolUseId);
      const corpo: FaseResposta = { fase: investigacao.faseAtual };
      res.json(corpo);
    }),
  );

  router.post(
    PIPELINE_AGENT_ROUTES.recusar,
    rota(async (req, res) => {
      const credenciais = await autorizador.credenciais(req);
      const investigacao = servico.investigacao(req.params.id);
      await autorizador.entidade(
        credenciais,
        investigacao.entityRef,
        pipelineAgentInvestigationApprovePermission,
      );
      const toolUseId = textoObrigatorio(
        campo(req.body, 'toolUseId'),
        'toolUseId',
        TAMANHO_MAX_TOOL_USE_ID,
      );
      const motivo = textoObrigatorio(
        campo(req.body, 'motivo'),
        'motivo',
        TAMANHO_MAX_MOTIVO,
      );
      await investigacao.recusar(toolUseId, motivo);
      const corpo: FaseResposta = { fase: investigacao.faseAtual };
      res.json(corpo);
    }),
  );

  router.post(
    PIPELINE_AGENT_ROUTES.orientar,
    rota(async (req, res) => {
      const credenciais = await autorizador.credenciais(req);
      const investigacao = servico.investigacao(req.params.id);
      await autorizador.entidade(
        credenciais,
        investigacao.entityRef,
        pipelineAgentInvestigationApprovePermission,
      );
      const toolUseId = textoObrigatorio(
        campo(req.body, 'toolUseId'),
        'toolUseId',
        TAMANHO_MAX_TOOL_USE_ID,
      );
      const texto = textoObrigatorio(
        campo(req.body, 'texto'),
        'texto',
        TAMANHO_MAX_TEXTO,
      );
      await investigacao.orientar(toolUseId, texto);
      const corpo: FaseResposta = { fase: investigacao.faseAtual };
      res.json(corpo);
    }),
  );

  router.get(
    PIPELINE_AGENT_ROUTES.project,
    rota(async (req, res) => {
      const credenciais = await autorizador.credenciais(req);
      const alvo = await autorizador.entidade(
        credenciais,
        textoDaQuery(req.query.entityRef),
        pipelineAgentInvestigationCreatePermission,
      );
      res.json(await servico.banner(alvo));
    }),
  );

  router.get(
    PIPELINE_AGENT_ROUTES.history,
    rota(async (req, res) => {
      const credenciais = await autorizador.credenciais(req);
      const alvo = await autorizador.entidade(
        credenciais,
        textoDaQuery(req.query.entityRef),
        pipelineAgentInvestigationCreatePermission,
      );
      res.json({ itens: await servico.historico(alvo) });
    }),
  );

  router.get(
    PIPELINE_AGENT_ROUTES.historyItem,
    rota(async (req, res) => {
      const credenciais = await autorizador.credenciais(req);
      const alvo = await autorizador.entidade(
        credenciais,
        textoDaQuery(req.query.entityRef),
        pipelineAgentInvestigationCreatePermission,
      );
      const corpo: DetalheHistorico = await servico.detalhe(
        alvo,
        idDaSessao(req.params.id),
      );
      res.json(corpo);
    }),
  );

  router.use(errorHandler(logger));
  return router;
}

// Every failure becomes the ErroResposta body and its status. Upstream messages are
// not forwarded; the log keeps only the error name and status.
function classificar(erro: unknown): { status: number; erro: string } {
  const tipo =
    typeof erro === 'object' && erro !== null && 'type' in erro
      ? String((erro as { type: unknown }).type)
      : '';
  if (tipo === 'entity.parse.failed')
    return { status: 400, erro: 'corpo JSON inválido' };
  if (tipo === 'entity.too.large')
    return { status: 413, erro: 'corpo grande demais' };
  return statusDoErro(erro);
}

function errorHandler(logger: LoggerService): express.ErrorRequestHandler {
  return (erro, req, res, _next) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    const { status, erro: mensagem } = classificar(erro);
    if (status >= 500)
      logger.warn(`pipeline-agent: ${req.method} ${req.path} falhou`, {
        status,
        causa: nomeDoErro(erro),
        // Status and route only (see GitLabError): no body, no headers, no token.
        ...(erro instanceof GitLabError ? { gitlab: erro.message } : {}),
      });
    res.status(status).json({ erro: mensagem });
  };
}
