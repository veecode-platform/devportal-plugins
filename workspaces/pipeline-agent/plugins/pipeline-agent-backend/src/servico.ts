import type {
  Banner,
  DetalheHistorico,
  ItemHistorico,
} from '@veecode-platform/backstage-plugin-pipeline-agent-common';
import { propostaDaSessao } from './agente/proposta';
import type { ArquivoSessao, AgentRuntime } from './agente/types';
import { custoUsd, parseUsage } from './cost';
import type { EntidadeResolvida } from './entidade';
import { ErroEstado, ErroNaoEncontrado } from './erros';
import { Investigacao, type Dependencias } from './investigacao';
import type { GitLab, Job, Pipeline } from './gitlab/types';
import { ocultarHost, sanitizarTrace } from './sanitizar';

// The investigations of this process. State lives in memory: one replica only. One
// running investigation per entity; a second start answers 409 until the first ends.

export const REF_PIPELINE = 'main';
const APP = 'pipeline-agent';
// Where the session finds the files: <DIRETORIO_MONTAGEM>/<nome>, under the session uploads.
export const DIRETORIO_MONTAGEM = '/pipeline';

export type Servico = {
  iniciar(alvo: EntidadeResolvida): Promise<Investigacao>;
  investigacao(id: string): Investigacao;
  banner(alvo: EntidadeResolvida): Promise<Banner>;
  historico(alvo: EntidadeResolvida): Promise<ItemHistorico[]>;
  detalhe(alvo: EntidadeResolvida, sessaoId: string): Promise<DetalheHistorico>;
};

export type OpcoesServico = {
  runtime: AgentRuntime;
  gitlabPara: (projectSlug: string) => GitLab;
  gitlabHost: string;
  agentId: string;
  environmentId: string;
  ritmo: Omit<Dependencias, 'runtime' | 'gitlab' | 'host'>;
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

function arquivo(
  nome: string,
  tipo: string,
  conteudo: Uint8Array,
): ArquivoSessao {
  return { nome, tipo, conteudo, caminho: `${DIRETORIO_MONTAGEM}/${nome}` };
}

// The trace and the diff are sanitized; the archive goes as-is because the agent needs the real code.
async function arquivosDoPipeline(
  gitlab: GitLab,
  pipeline: Pipeline,
  job: Job,
  host: string,
): Promise<ArquivoSessao[]> {
  const [trace, diff, repo] = await Promise.all([
    gitlab.getJobTrace(job.id),
    gitlab.getCommitDiff(pipeline.sha),
    gitlab.getArchive(pipeline.sha),
  ]);
  const codificar = (texto: string) => new TextEncoder().encode(texto);
  return [
    arquivo('trace.log', 'text/plain', codificar(sanitizarTrace(trace, host))),
    arquivo('commit.diff', 'text/plain', codificar(ocultarHost(diff, host))),
    arquivo('repo.tar.gz', 'application/gzip', repo),
  ];
}

// The event types that carry a proposal: the abrir_mr call and the answer it got.
const TIPOS_DA_PROPOSTA = ['agent.custom_tool_use', 'user.custom_tool_result'];

// The session records the merge request's iid, not its URL. The GitLab web address of
// a merge request is the project path plus its iid, on the configured host.
function urlDaMr(host: string, projectSlug: string, iid: number): string {
  return `https://${host}/${projectSlug}/-/merge_requests/${iid}`;
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
  // The lock is per project: two entities bound to one project share its one investigation.
  const ativaPorProjeto = new Map<string, Investigacao>();
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
      const { entityRef, projectSlug } = alvo;
      const anterior = ativaPorProjeto.get(projectSlug);
      if (reservadas.has(projectSlug) || anterior?.ativa) {
        throw new ErroEstado(
          `Já existe uma investigação em andamento para ${projectSlug}.`,
        );
      }
      reservadas.add(projectSlug);
      try {
        const gitlab = gitlabDe(alvo.projectSlug);
        const iniciadoEm = Date.now();
        const atual = await falhoAtual(gitlab, REF_PIPELINE);
        if (!atual)
          throw new ErroEstado(
            `Não há pipeline com falha na ${REF_PIPELINE} de ${alvo.projectSlug}.`,
          );
        const projeto = await gitlab.getProject();
        const { pipeline, job, titulo } = atual;
        // Fetched before the session exists: a GitLab failure leaves no session behind.
        const arquivos = await arquivosDoPipeline(
          gitlab,
          pipeline,
          job,
          opcoes.gitlabHost,
        );
        const sessaoId = await runtime.createSession({
          agentId: opcoes.agentId,
          environmentId: opcoes.environmentId,
          metadata: {
            app: APP,
            projeto: alvo.projectSlug,
            pipeline_id: String(pipeline.id),
          },
          title: `Pipeline ${pipeline.id}, job ${job.nome}`,
          arquivos,
        });
        const investigacao = new Investigacao(
          { runtime, gitlab, host: opcoes.gitlabHost, ...ritmo },
          {
            id: sessaoId,
            entityRef,
            pipelineId: pipeline.id,
            ref: pipeline.ref,
            iniciadoEm,
          },
        );
        investigacoes.set(sessaoId, investigacao);
        ativaPorProjeto.set(projectSlug, investigacao);
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
            titulo: ocultarHost(titulo, opcoes.gitlabHost),
          }),
        );
        return investigacao;
      } finally {
        reservadas.delete(projectSlug);
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

    async detalhe(alvo, sessaoId) {
      const sessao = await runtime.obterSessao(sessaoId);
      // Another project's session is not found, the same as an unknown id, so the
      // caller cannot tell whether it exists. Events are read only after this check.
      if (
        sessao.metadata.app !== APP ||
        sessao.metadata.projeto !== alvo.projectSlug
      )
        throw new ErroNaoEncontrado('investigação não encontrada');
      const proposta = propostaDaSessao(
        await runtime.listarEventos(sessaoId, TIPOS_DA_PROPOSTA),
      );
      if (proposta === null) return { id: sessaoId, proposta: null };
      return {
        id: sessaoId,
        proposta: {
          tentativa: proposta.tentativa,
          titulo: proposta.titulo,
          causa: proposta.causa,
          arquivos: proposta.arquivos,
          mr:
            proposta.mr === null
              ? null
              : {
                  iid: proposta.mr.iid,
                  url: urlDaMr(
                    opcoes.gitlabHost,
                    alvo.projectSlug,
                    proposta.mr.iid,
                  ),
                  statusPipeline: proposta.mr.statusPipeline,
                },
        },
      };
    },
  };
}
