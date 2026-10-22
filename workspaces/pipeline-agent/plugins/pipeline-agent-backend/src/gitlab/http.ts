import http from 'node:http';
import https from 'node:https';
import { type ArquivoCommit, renderizarDiffCommit } from '../diff';
import type {
  AcaoArquivo,
  GitLab,
  Job,
  MergeRequest,
  Pipeline,
  ProjetoInfo,
} from './types';
import { GitLabError } from './types';

// REST v4 client. The token goes only in the PRIVATE-TOKEN header. Errors cite the
// status and the route, never the response body or the headers.

type Json = Record<string, unknown>;
type Buscar = (url: string, init: RequestInit) => Promise<Response>;
type Baixar = (
  url: string,
  cabecalhos: Record<string, string>,
) => Promise<{ status: number; corpo: Buffer }>;

const ROTA_ARQUIVO = '/projects/:id/repository/archive.tar.gz';

// Node's fetch always sends "Sec-Fetch-Mode: cors", and GitLab answers 406 to an
// archive download that carries it, so the archive goes through node:http(s).
const baixarSemFetch: Baixar = (url, cabecalhos) =>
  new Promise((resolve, reject) => {
    const modulo = url.startsWith('https:') ? https : http;
    const pedido = modulo.get(url, { headers: cabecalhos }, resposta => {
      const partes: Buffer[] = [];
      resposta.on('data', (parte: Buffer) => partes.push(parte));
      resposta.on('end', () =>
        resolve({
          status: resposta.statusCode ?? 0,
          corpo: Buffer.concat(partes),
        }),
      );
      resposta.on('error', reject);
    });
    pedido.setTimeout(60_000, () =>
      pedido.destroy(new Error('tempo esgotado ao baixar o arquivo')),
    );
    pedido.on('error', reject);
  });

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

function inteiro(valor: unknown): number {
  return typeof valor === 'number' && Number.isInteger(valor) ? valor : 0;
}

function arquivoDeCommit(j: Json): ArquivoCommit {
  return {
    antes: texto(j.old_path),
    depois: texto(j.new_path),
    novo: j.new_file === true,
    removido: j.deleted_file === true,
    hunks: texto(j.diff),
  };
}

function urlOpcional(valor: unknown): string | null {
  return typeof valor === 'string' && valor !== '' ? valor : null;
}

function pipelineDe(j: Json): Pipeline {
  return {
    id: inteiro(j.id),
    status: texto(j.status),
    ref: texto(j.ref),
    sha: texto(j.sha),
    criadoEm: texto(j.created_at),
    url: urlOpcional(j.web_url),
  };
}

export class GitLabHttp implements GitLab {
  private readonly base: string;
  private readonly token: string;
  private readonly projeto: string;
  private readonly buscar: Buscar;
  private readonly baixar: Baixar;

  constructor(opcoes: {
    base: string;
    token: string;
    projeto: string;
    buscar?: Buscar;
    baixar?: Baixar;
  }) {
    this.base = opcoes.base.replace(/\/$/, '');
    this.token = opcoes.token;
    this.projeto = opcoes.projeto;
    this.buscar = opcoes.buscar ?? ((url, init) => fetch(url, init));
    this.baixar = opcoes.baixar ?? baixarSemFetch;
  }

  private get pid(): string {
    return encodeURIComponent(this.projeto);
  }

  private async chamar(
    metodo: string,
    rota: string,
    corpo?: unknown,
  ): Promise<Response> {
    const cabecalhos: Record<string, string> = { 'PRIVATE-TOKEN': this.token };
    if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
    const resposta = await this.buscar(`${this.base}${rota}`, {
      method: metodo,
      headers: cabecalhos,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: 'no-store',
    });
    if (!resposta.ok && resposta.status !== 404) {
      throw new GitLabError(resposta.status, metodo, rota.split('?')[0]);
    }
    return resposta;
  }

  private async json(
    metodo: string,
    rota: string,
    corpo?: unknown,
  ): Promise<Json | null> {
    const r = await this.chamar(metodo, rota, corpo);
    if (r.status === 404) return null;
    return (await r.json()) as Json;
  }

  private async lista(rota: string): Promise<Json[]> {
    const r = await this.chamar('GET', rota);
    if (r.status === 404) return [];
    return (await r.json()) as Json[];
  }

  async getProject(): Promise<ProjetoInfo> {
    const j = await this.json('GET', `/projects/${this.pid}`);
    if (!j) throw new GitLabError(404, 'GET', '/projects/:id');
    return { id: inteiro(j.id), caminho: this.projeto };
  }

  async findLatestFailedPipeline(ref: string): Promise<Pipeline | null> {
    const itens = await this.lista(
      `/projects/${this.pid}/pipelines?ref=${encodeURIComponent(
        ref,
      )}&status=failed&order_by=id&sort=desc&per_page=1`,
    );
    return itens[0] ? pipelineDe(itens[0]) : null;
  }

  async listJobs(pipelineId: number): Promise<Job[]> {
    const itens = await this.lista(
      `/projects/${this.pid}/pipelines/${pipelineId}/jobs?per_page=100`,
    );
    return itens.map(j => ({
      id: inteiro(j.id),
      nome: texto(j.name),
      status: texto(j.status),
    }));
  }

  async listFailedJobs(pipelineId: number): Promise<Job[]> {
    const itens = await this.lista(
      `/projects/${this.pid}/pipelines/${pipelineId}/jobs?scope[]=failed&per_page=100`,
    );
    return itens.map(j => ({
      id: inteiro(j.id),
      nome: texto(j.name),
      status: texto(j.status),
    }));
  }

  async getJobTrace(jobId: number): Promise<string> {
    const r = await this.chamar(
      'GET',
      `/projects/${this.pid}/jobs/${jobId}/trace`,
    );
    if (r.status === 404) return '';
    return r.text();
  }

  async getCommitTitle(sha: string): Promise<string> {
    const j = await this.json(
      'GET',
      `/projects/${this.pid}/repository/commits/${encodeURIComponent(sha)}`,
    );
    return texto(j?.title);
  }

  // GitLab pages this endpoint (20 files by default), so every page is read.
  async getCommitDiff(sha: string): Promise<string> {
    const arquivos: ArquivoCommit[] = [];
    for (let pagina = 1; ; pagina += 1) {
      const itens = await this.lista(
        `/projects/${this.pid}/repository/commits/${encodeURIComponent(
          sha,
        )}/diff?per_page=100&page=${pagina}`,
      );
      arquivos.push(...itens.map(arquivoDeCommit));
      if (itens.length < 100) break;
    }
    return renderizarDiffCommit(arquivos);
  }

  // Unlike the trace, a missing commit is an error: there is no empty archive to fall back on.
  async getArchive(sha: string): Promise<Uint8Array> {
    const r = await this.baixar(
      `${this.base}/projects/${
        this.pid
      }/repository/archive.tar.gz?sha=${encodeURIComponent(sha)}`,
      { 'PRIVATE-TOKEN': this.token },
    );
    if (r.status < 200 || r.status >= 300)
      throw new GitLabError(r.status, 'GET', ROTA_ARQUIVO);
    return r.corpo;
  }

  async getFile(caminho: string, ref: string): Promise<string | null> {
    const rota = `/projects/${this.pid}/repository/files/${encodeURIComponent(
      caminho,
    )}?ref=${encodeURIComponent(ref)}`;
    const j = await this.json('GET', rota);
    if (!j) return null;
    return Buffer.from(texto(j.content), 'base64').toString('utf8');
  }

  async createBranch(nome: string, ref: string): Promise<void> {
    await this.chamar('POST', `/projects/${this.pid}/repository/branches`, {
      branch: nome,
      ref,
    });
  }

  async commit(
    branch: string,
    mensagem: string,
    acoes: AcaoArquivo[],
  ): Promise<void> {
    await this.chamar('POST', `/projects/${this.pid}/repository/commits`, {
      branch,
      commit_message: mensagem,
      actions: acoes.map(a => ({
        action: a.acao,
        file_path: a.caminho,
        content: a.conteudo,
      })),
    });
  }

  async createMR(entrada: {
    origem: string;
    destino: string;
    titulo: string;
    descricao: string;
    rotulo: string;
  }): Promise<MergeRequest> {
    const j = await this.json('POST', `/projects/${this.pid}/merge_requests`, {
      source_branch: entrada.origem,
      target_branch: entrada.destino,
      title: entrada.titulo,
      description: entrada.descricao,
      labels: entrada.rotulo,
    });
    if (!j) throw new GitLabError(404, 'POST', '/merge_requests');
    return {
      iid: inteiro(j.iid),
      titulo: texto(j.title),
      url: texto(j.web_url),
    };
  }

  async getMRPipeline(iid: number): Promise<Pipeline | null> {
    const j = await this.json(
      'GET',
      `/projects/${this.pid}/merge_requests/${iid}`,
    );
    const head = j?.head_pipeline;
    return head && typeof head === 'object' ? pipelineDe(head as Json) : null;
  }

  async listBranches(prefixo: string): Promise<string[]> {
    const itens = await this.lista(
      `/projects/${this.pid}/repository/branches?search=${encodeURIComponent(
        prefixo,
      )}&per_page=100`,
    );
    return itens
      .map(j => texto(j.name))
      .filter(nome => nome.startsWith(prefixo));
  }
}
