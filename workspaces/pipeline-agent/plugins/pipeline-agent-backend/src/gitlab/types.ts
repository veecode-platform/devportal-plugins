// GitLab operations the investigation uses. Two implementations: in memory (fake
// mode) and REST v4 (real mode). Every instance is bound to one project, the one
// named by the entity's gitlab.com/project-slug annotation.

export type Pipeline = {
  id: number;
  status: string;
  ref: string;
  sha: string;
  criadoEm: string;
  url: string;
};

export type Job = { id: number; nome: string; status: string };

export type MergeRequest = { iid: number; titulo: string; url: string };

export type AcaoArquivo = {
  acao: 'create' | 'update';
  caminho: string;
  conteudo: string;
};

export type ProjetoInfo = { id: number; caminho: string };

// `branch` is created from `base` in the same request. GitLab refuses a `branch` that already exists.
export type EntradaCommit = {
  branch: string;
  base: string;
  mensagem: string;
  acoes: AcaoArquivo[];
};

export interface GitLab {
  getProject(): Promise<ProjetoInfo>;
  findLatestFailedPipeline(ref: string): Promise<Pipeline | null>;
  listJobs(pipelineId: number): Promise<Job[]>;
  listFailedJobs(pipelineId: number): Promise<Job[]>;
  getJobTrace(jobId: number): Promise<string>;
  getCommitTitle(sha: string): Promise<string>;
  getCommitDiff(sha: string): Promise<string>;
  getArchive(sha: string): Promise<Uint8Array>;
  getFile(caminho: string, ref: string): Promise<string | null>;
  commit(entrada: EntradaCommit): Promise<void>;
  createMR(entrada: {
    origem: string;
    destino: string;
    titulo: string;
    descricao: string;
    rotulo: string;
  }): Promise<MergeRequest>;
  getMRPipeline(iid: number): Promise<Pipeline | null>;
  listBranches(prefixo: string): Promise<string[]>;
}

export const STATUS_TERMINAIS = new Set([
  'success',
  'failed',
  'canceled',
  'skipped',
]);

// Carries the status and the route only. Never the response body or headers.
export class GitLabError extends Error {
  readonly status: number;
  constructor(status: number, metodo: string, rota: string) {
    super(`GitLab respondeu ${status} em ${metodo} ${rota}`);
    this.name = 'GitLabError';
    this.status = status;
  }
}
