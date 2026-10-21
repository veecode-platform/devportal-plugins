import type {
  Banner,
  ItemHistorico,
} from '@veecode-platform/backstage-plugin-pipeline-agent-common';
import type { AgentRuntime } from './agente/types';
import { custoUsd, parseUsage } from './cost';
import type { EntidadeResolvida } from './entidade';
import { ErroEstado, ErroNaoEncontrado } from './erros';
import { Investigacao, type Dependencias } from './investigacao';
import type { GitLab, Job, Pipeline } from './gitlab/types';

// The investigations of this process. State lives in memory: one replica only. One
// running investigation per entity; a second start answers 409 until the first ends.

export const REF_PIPELINE = 'main';
const APP = 'pipeline-agent';

export type Servico = {
  iniciar(alvo: EntidadeResolvida): Promise<Investigacao>;
  investigacao(id: string): Investigacao;
  banner(alvo: EntidadeResolvida): Promise<Banner>;
  historico(alvo: EntidadeResolvida): Promise<ItemHistorico[]>;
};

export type OpcoesServico = {
  runtime: AgentRuntime;
  gitlabPara: (projectSlug: string) => GitLab;
  agentId: string;
  environmentId: string;
  ritmo: Omit<Dependencias, 'runtime' | 'gitlab'>;
};

type FalhoAtual = { pipeline: Pipeline; job: Job; titulo: string };

async function falhoAtual(
  gitlab: GitLab,
  ref: string,
): Promise<FalhoAtual | null> {
  const pipeline = await gitlab.findLatestFailedPipeline(ref);
  if (!pipeline) return null;
  const job = (await gitlab.listFailedJobs(pipeline.id))[0];
  if (!job) return null;
  return { pipeline, job, titulo: await gitlab.getCommitTitle(pipeline.sha) };
}

// Initial message (pt-BR): the agent starts from the pipeline branch and the full commit.
function mensagemInicial(p: {
  projeto: string;
  projetoId: number;
  pipelineId: number;
  ref: string;
  jobId: number;
  jobNome: string;
  sha: string;
  titulo: string;
}): string {
  return [
    `Projeto ${p.projeto} (id ${p.projetoId}).`,
    `Pipeline ${p.pipelineId} falhou no job ${p.jobNome} (id ${p.jobId}).`,
    `Branch do pipeline: ${p.ref}.`,
    `Commit ${p.sha} "${p.titulo}".`,
    'Investigue a causa: comece pelo log do job que falhou, depois o diff do commit suspeito, e reproduza a falha com mvn -B test.',
    'Proponha a menor correção pela ferramenta abrir_mr. Escreva em pt-BR, em frases curtas.',
  ].join('\n');
}

export function criarServico(opcoes: OpcoesServico): Servico {
  const { runtime, ritmo } = opcoes;
  const investigacoes = new Map<string, Investigacao>();
  const ativaPorEntidade = new Map<string, Investigacao>();
  const reservadas = new Set<string>();
  const gitlabs = new Map<string, GitLab>();

  // One client per project for the life of the process: in fake mode its in-memory
  // branches and merge requests must persist across requests.
  const gitlabDe = (projectSlug: string): GitLab => {
    let gitlab = gitlabs.get(projectSlug);
    if (!gitlab) {
      gitlab = opcoes.gitlabPara(projectSlug);
      gitlabs.set(projectSlug, gitlab);
    }
    return gitlab;
  };

  return {
    async iniciar(alvo) {
      const { entityRef } = alvo;
      const anterior = ativaPorEntidade.get(entityRef);
      if (reservadas.has(entityRef) || anterior?.ativa) {
        throw new ErroEstado(
          `já há uma investigação em andamento para ${entityRef}`,
        );
      }
      reservadas.add(entityRef);
      try {
        const gitlab = gitlabDe(alvo.projectSlug);
        const iniciadoEm = Date.now();
        const atual = await falhoAtual(gitlab, REF_PIPELINE);
        if (!atual)
          throw new ErroEstado(
            `não há pipeline falho na branch ${REF_PIPELINE}`,
          );
        const projeto = await gitlab.getProject();
        const { pipeline, job, titulo } = atual;
        const sessaoId = await runtime.createSession({
          agentId: opcoes.agentId,
          environmentId: opcoes.environmentId,
          metadata: {
            app: APP,
            projeto: alvo.projectSlug,
            pipeline_id: String(pipeline.id),
          },
          title: `Pipeline ${pipeline.id} · job ${job.nome}`,
        });
        const investigacao = new Investigacao(
          { runtime, gitlab, ...ritmo },
          {
            id: sessaoId,
            entityRef,
            pipelineId: pipeline.id,
            ref: pipeline.ref,
            iniciadoEm,
          },
        );
        investigacoes.set(sessaoId, investigacao);
        ativaPorEntidade.set(entityRef, investigacao);
        const fluxo = await runtime.abrirFluxo(sessaoId);
        await investigacao.comecar(
          fluxo,
          mensagemInicial({
            projeto: alvo.projectSlug,
            projetoId: projeto.id,
            pipelineId: pipeline.id,
            ref: pipeline.ref,
            jobId: job.id,
            jobNome: job.nome,
            sha: pipeline.sha,
            titulo,
          }),
        );
        return investigacao;
      } finally {
        reservadas.delete(entityRef);
      }
    },

    investigacao(id) {
      const investigacao = investigacoes.get(id);
      if (!investigacao)
        throw new ErroNaoEncontrado('investigação não encontrada');
      return investigacao;
    },

    async banner(alvo) {
      const atual = await falhoAtual(gitlabDe(alvo.projectSlug), REF_PIPELINE);
      if (!atual) return { projeto: alvo.projectSlug, pipeline: null };
      const { pipeline, job, titulo } = atual;
      return {
        projeto: alvo.projectSlug,
        pipeline: {
          id: pipeline.id,
          ref: pipeline.ref,
          criadoEm: pipeline.criadoEm,
          haMinutos: Math.max(
            0,
            Math.floor((Date.now() - Date.parse(pipeline.criadoEm)) / 60_000),
          ),
          job: { id: job.id, nome: job.nome },
          commit: { sha: pipeline.sha.slice(0, 8), titulo },
        },
      };
    },

    async historico(alvo) {
      const sessoes = await runtime.listarSessoes(
        opcoes.agentId,
        alvo.projectSlug,
      );
      return sessoes
        .filter(
          x =>
            x.metadata.app === APP && x.metadata.projeto === alvo.projectSlug,
        )
        .map(x => ({
          id: x.id,
          titulo: x.title ?? 'Sem título',
          criadoEm: x.criadaEm,
          status: x.status,
          custoUsd: custoUsd(parseUsage(x.usage), 0),
        }));
    },
  };
}
