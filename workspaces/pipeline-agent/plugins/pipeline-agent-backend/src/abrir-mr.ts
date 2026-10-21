import type { AcaoArquivo, GitLab, Pipeline } from './gitlab/types';
import { STATUS_TERMINAIS } from './gitlab/types';

// Custom tool abrir_mr: after approval, create the branch, commit, open the merge
// request and wait for its pipeline. The contract is in the rehearsal design.

export const ROTULO_MR = 'agente-pipeline';
export const LIMITE_TENTATIVAS = 3;
const TAMANHO_MAX_TITULO = 120;
const TAMANHO_MAX_CAUSA = 4000;
const TAMANHO_MAX_ARQUIVO = 200_000;
const ARQUIVOS_MAX = 10;
const LINHAS_LOG_FINAL = 60;
const CARACTERES_LOG_FINAL = 4000;
const CAMINHO_VALIDO = /^[A-Za-z0-9._/-]+$/;

export type ArquivoEntrada = { caminho: string; conteudo: string };
export type AbrirMrEntrada = {
  titulo: string;
  causa: string;
  arquivos: ArquivoEntrada[];
};
export type ArquivoProposto = ArquivoEntrada & { existente: string | null };

type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

function registro(valor: unknown): Record<string, unknown> | null {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

function textoLimitado(
  valor: unknown,
  nome: string,
  max: number,
): Resultado<string> {
  if (typeof valor !== 'string' || valor.trim() === '')
    return { ok: false, erro: `${nome} é obrigatório` };
  if (valor.length > max)
    return { ok: false, erro: `${nome} passa de ${max} caracteres` };
  return { ok: true, valor };
}

// Validates the input that came from the model before any GitLab call.
export function parseAbrirMrEntrada(bruto: unknown): Resultado<AbrirMrEntrada> {
  const r = registro(bruto);
  if (!r) return { ok: false, erro: 'a entrada precisa ser um objeto' };
  const titulo = textoLimitado(r.titulo, 'titulo', TAMANHO_MAX_TITULO);
  if (!titulo.ok) return titulo;
  const causa = textoLimitado(r.causa, 'causa', TAMANHO_MAX_CAUSA);
  if (!causa.ok) return causa;
  if (
    !Array.isArray(r.arquivos) ||
    r.arquivos.length === 0 ||
    r.arquivos.length > ARQUIVOS_MAX
  ) {
    return {
      ok: false,
      erro: `arquivos precisa ter de 1 a ${ARQUIVOS_MAX} itens`,
    };
  }
  const arquivos: ArquivoEntrada[] = [];
  for (const item of r.arquivos) {
    const a = registro(item);
    if (!a) return { ok: false, erro: 'cada arquivo precisa ser um objeto' };
    const caminho = textoLimitado(a.caminho, 'caminho', 300);
    if (!caminho.ok) return caminho;
    const seguro =
      CAMINHO_VALIDO.test(caminho.valor) &&
      !caminho.valor.startsWith('/') &&
      !caminho.valor.split('/').includes('..');
    if (!seguro)
      return {
        ok: false,
        erro: `caminho fora do repositório: ${caminho.valor}`,
      };
    const conteudo = textoLimitado(
      a.conteudo,
      `conteudo de ${caminho.valor}`,
      TAMANHO_MAX_ARQUIVO,
    );
    if (!conteudo.ok) return conteudo;
    arquivos.push({ caminho: caminho.valor, conteudo: conteudo.valor });
  }
  return {
    ok: true,
    valor: { titulo: titulo.valor, causa: causa.valor, arquivos },
  };
}

export type ResultadoFerramenta = {
  mr_url: string;
  pipeline_status: string;
  log_final?: string;
  instrucao?: string;
};

export type ExecucaoAbrirMr = {
  gitlab: GitLab;
  pipelineId: number;
  ref: string;
  tentativa: number;
  entrada: AbrirMrEntrada;
  arquivos: ArquivoProposto[];
  intervaloMs: number;
  prazoMs: number;
  dormir: (ms: number) => Promise<void>;
  aoAbrirMr: (mr: { iid: number; titulo: string; url: string }) => void;
  aoMudarPipeline: (p: {
    id: number;
    status: string;
    url: string | null;
    jobs: string[];
    jobFalho: string | null;
  }) => void;
};

export type DesfechoAbrirMr = {
  resultado: ResultadoFerramenta;
  sucesso: boolean;
};

function cauda(texto: string): string {
  const linhas = texto.trimEnd().split('\n');
  const fim = linhas.slice(-LINHAS_LOG_FINAL).join('\n');
  return fim.length > CARACTERES_LOG_FINAL
    ? fim.slice(-CARACTERES_LOG_FINAL)
    : fim;
}

async function esperarPipeline(
  x: ExecucaoAbrirMr,
  iid: number,
): Promise<Pipeline> {
  const inicio = Date.now();
  let ultimo = '';
  for (;;) {
    const atual = await x.gitlab.getMRPipeline(iid);
    if (atual && atual.status !== ultimo) {
      ultimo = atual.status;
      x.aoMudarPipeline({
        id: atual.id,
        status: atual.status,
        url: atual.url,
        jobs: [],
        jobFalho: null,
      });
    }
    if (atual && STATUS_TERMINAIS.has(atual.status)) return atual;
    if (Date.now() - inicio > x.prazoMs)
      throw new Error('o pipeline do MR não terminou no prazo');
    await x.dormir(x.intervaloMs);
  }
}

// Branch name: agente/fix-<pipeline>-<n>. If the branch already exists (a previous
// run without a reset), take the next free number instead of failing.
export async function escolherBranch(
  gitlab: GitLab,
  pipelineId: number,
  tentativa: number,
): Promise<string> {
  const prefixo = `agente/fix-${pipelineId}-`;
  const existentes = new Set(await gitlab.listBranches(prefixo));
  let n = tentativa;
  while (existentes.has(`${prefixo}${n}`)) n += 1;
  return `${prefixo}${n}`;
}

// The branch starts from the ref of the failed pipeline, and the MR targets that same ref.
export async function executarAbrirMr(
  x: ExecucaoAbrirMr,
): Promise<DesfechoAbrirMr> {
  const branch = await escolherBranch(x.gitlab, x.pipelineId, x.tentativa);
  await x.gitlab.createBranch(branch, x.ref);
  const acoes: AcaoArquivo[] = x.arquivos.map(a => ({
    acao: a.existente === null ? 'create' : 'update',
    caminho: a.caminho,
    conteudo: a.conteudo,
  }));
  await x.gitlab.commit(branch, x.entrada.titulo, acoes);
  const mr = await x.gitlab.createMR({
    origem: branch,
    destino: x.ref,
    titulo: x.entrada.titulo,
    descricao: x.entrada.causa,
    rotulo: ROTULO_MR,
  });
  x.aoAbrirMr({ iid: mr.iid, titulo: mr.titulo, url: mr.url });

  const pipeline = await esperarPipeline(x, mr.iid);
  const jobs = await x.gitlab.listJobs(pipeline.id);
  const nomesJobs = jobs.map(j => j.nome);
  let falhou: { nome: string; trace: string } | null = null;
  if (pipeline.status === 'failed') {
    const falhos = await x.gitlab.listFailedJobs(pipeline.id);
    const primeiro = falhos[0];
    if (primeiro)
      falhou = {
        nome: primeiro.nome,
        trace: await x.gitlab.getJobTrace(primeiro.id),
      };
  }
  x.aoMudarPipeline({
    id: pipeline.id,
    status: pipeline.status,
    url: pipeline.url,
    jobs: nomesJobs,
    jobFalho: falhou?.nome ?? null,
  });

  const sucesso = pipeline.status === 'success';
  const resultado: ResultadoFerramenta = {
    mr_url: mr.url,
    pipeline_status: pipeline.status,
  };
  if (falhou) resultado.log_final = cauda(falhou.trace);
  if (!sucesso && x.tentativa >= LIMITE_TENTATIVAS) {
    resultado.instrucao =
      'Terceira tentativa com o pipeline vermelho. Pare: não abra outro MR. Escreva o diagnóstico (causa, evidência e o que foi tentado) e passe o caso para uma pessoa.';
  }
  return { resultado, sucesso };
}
