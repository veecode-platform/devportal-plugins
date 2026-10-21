import type {
  AcaoArquivo,
  GitLab,
  Job,
  MergeRequest,
  Pipeline,
  ProjetoInfo,
} from '../gitlab/types';
import { GitLabError } from '../gitlab/types';
import {
  CAMINHO_ALVO,
  JAVA_ANTES,
  JOB_BUILD_ID,
  JOB_TEST_ID,
  MR_FAKE_IID,
  PIPELINE_FALHO_ID,
  PIPELINE_MR_ID,
  REF_PIPELINE,
  SHA_COMMIT,
  TITULO_COMMIT,
  TRACE_TEST,
} from './cenario';

// In-memory GitLab for one project. The pipeline of the merge request stays
// "running" for duracaoPipelineMs and then passes, as in the rehearsal.

type MrFake = {
  iid: number;
  titulo: string;
  origem: string;
  destino: string;
  criadoEmMs: number;
};

export class GitLabFake implements GitLab {
  private readonly projeto: string;
  private readonly duracaoPipelineMs: number;
  private readonly iniciadoEm = Date.now();
  private readonly main = new Map<string, string>([[CAMINHO_ALVO, JAVA_ANTES]]);
  private readonly branches = new Map<string, Map<string, string>>();
  private readonly mrs: MrFake[] = [];
  private proximoIid = MR_FAKE_IID;

  constructor(projeto: string, opcoes: { duracaoPipelineMs: number }) {
    this.projeto = projeto;
    this.duracaoPipelineMs = opcoes.duracaoPipelineMs;
  }

  async getProject(): Promise<ProjetoInfo> {
    return { id: 4242, caminho: this.projeto };
  }

  private pipelineFalho(): Pipeline {
    return {
      id: PIPELINE_FALHO_ID,
      status: 'failed',
      ref: REF_PIPELINE,
      sha: SHA_COMMIT,
      criadoEm: new Date(this.iniciadoEm - 14 * 60_000).toISOString(),
      url: `https://gitlab.com/${this.projeto}/-/pipelines/${PIPELINE_FALHO_ID}`,
    };
  }

  private mrDe(pipelineId: number): MrFake | undefined {
    return this.mrs.find(
      mr => PIPELINE_MR_ID + (mr.iid - MR_FAKE_IID) === pipelineId,
    );
  }

  private pipelineMr(mr: MrFake): Pipeline {
    const id = PIPELINE_MR_ID + (mr.iid - MR_FAKE_IID);
    const rodando = Date.now() - mr.criadoEmMs < this.duracaoPipelineMs;
    return {
      id,
      status: rodando ? 'running' : 'success',
      ref: mr.origem,
      sha: 'fake-sha-mr',
      criadoEm: new Date(mr.criadoEmMs).toISOString(),
      url: `https://gitlab.com/${this.projeto}/-/pipelines/${id}`,
    };
  }

  async findLatestFailedPipeline(ref: string): Promise<Pipeline | null> {
    return ref === REF_PIPELINE ? this.pipelineFalho() : null;
  }

  async listJobs(pipelineId: number): Promise<Job[]> {
    if (pipelineId === PIPELINE_FALHO_ID) {
      return [
        { id: JOB_BUILD_ID, nome: 'build', status: 'success' },
        { id: JOB_TEST_ID, nome: 'test', status: 'failed' },
      ];
    }
    if (this.mrDe(pipelineId)) {
      return [
        { id: 6001, nome: 'build', status: 'success' },
        { id: 6002, nome: 'test', status: 'success' },
      ];
    }
    return [];
  }

  async listFailedJobs(pipelineId: number): Promise<Job[]> {
    const todos = await this.listJobs(pipelineId);
    return todos.filter(j => j.status === 'failed');
  }

  async getJobTrace(jobId: number): Promise<string> {
    return jobId === JOB_TEST_ID ? TRACE_TEST : '';
  }

  async getCommitTitle(sha: string): Promise<string> {
    return sha === SHA_COMMIT ? TITULO_COMMIT : '';
  }

  // Files of a ref: "main" or a branch created in this process. Unknown refs
  // answer 404, as GitLab does.
  private arquivosDe(ref: string): Map<string, string> {
    if (ref === 'main') return this.main;
    const branch = this.branches.get(ref);
    if (!branch) throw new GitLabError(404, 'GET', '/repository/files');
    return branch;
  }

  async getFile(caminho: string, ref: string): Promise<string | null> {
    return this.arquivosDe(ref).get(caminho) ?? null;
  }

  async createBranch(nome: string, ref: string): Promise<void> {
    if (this.branches.has(nome))
      throw new GitLabError(400, 'POST', '/repository/branches');
    this.branches.set(nome, new Map(this.arquivosDe(ref)));
  }

  async commit(
    branch: string,
    _mensagem: string,
    acoes: AcaoArquivo[],
  ): Promise<void> {
    const arquivos = this.branches.get(branch);
    if (!arquivos) throw new GitLabError(404, 'POST', '/repository/commits');
    for (const acao of acoes) arquivos.set(acao.caminho, acao.conteudo);
  }

  async createMR(entrada: {
    origem: string;
    destino: string;
    titulo: string;
    descricao: string;
    rotulo: string;
  }): Promise<MergeRequest> {
    const iid = this.proximoIid++;
    this.mrs.push({
      iid,
      titulo: entrada.titulo,
      origem: entrada.origem,
      destino: entrada.destino,
      criadoEmMs: Date.now(),
    });
    return {
      iid,
      titulo: entrada.titulo,
      url: `https://gitlab.com/${this.projeto}/-/merge_requests/${iid}`,
    };
  }

  async getMRPipeline(iid: number): Promise<Pipeline | null> {
    const mr = this.mrs.find(m => m.iid === iid);
    return mr ? this.pipelineMr(mr) : null;
  }

  async listBranches(prefixo: string): Promise<string[]> {
    return [...this.branches.keys()].filter(nome => nome.startsWith(prefixo));
  }
}
