import { parseAbrirMrEntrada, type AbrirMrEntrada } from '../abrir-mr';
import type { SdkEvent } from './types';

// Reads the proposal of a finished session from its event log. A proposal is a custom
// tool use named abrir_mr whose input passes the same boundary parser the live flow
// uses, so an input the live flow rejected does not count.

const FERRAMENTA = 'abrir_mr';

type ResultadoDaFerramenta = Extract<
  SdkEvent,
  { type: 'user.custom_tool_result' }
>;

type Resultado = { erro: boolean; texto: string };

type Proposta = { entrada: AbrirMrEntrada; resultado: Resultado | null };

export type PropostaSessao = {
  tentativa: number;
  titulo: string;
  causa: string;
  arquivos: string[];
  mr: { iid: number; statusPipeline: string } | null;
};

function textoDoResultado(conteudo: ResultadoDaFerramenta['content']): string {
  return (conteudo ?? [])
    .map(bloco => (bloco.type === 'text' ? bloco.text : ''))
    .filter(t => t.length > 0)
    .join('\n');
}

// The result of a proposal that opened a merge request is JSON with mr_iid and
// pipeline_status. Any other result (a refusal, an error, the attempt limit) has no MR.
function mrDoResultado(
  resultado: Resultado | null,
): { iid: number; statusPipeline: string } | null {
  if (resultado === null || resultado.erro) return null;
  let bruto: unknown;
  try {
    bruto = JSON.parse(resultado.texto);
  } catch {
    return null;
  }
  if (typeof bruto !== 'object' || bruto === null) return null;
  const { mr_iid, pipeline_status } = bruto as Record<string, unknown>;
  if (typeof mr_iid !== 'number' || typeof pipeline_status !== 'string') {
    return null;
  }
  return { iid: mr_iid, statusPipeline: pipeline_status };
}

// The last proposal whose result opened a merge request, so a later refusal, failure or
// attempt-limit answer does not hide it. With no MR at all, the last proposal. -1 when
// there are no proposals.
function indiceDaMostrada(
  mrs: Array<ReturnType<typeof mrDoResultado>>,
): number {
  for (let i = mrs.length - 1; i >= 0; i -= 1) {
    if (mrs[i] !== null) return i;
  }
  return mrs.length - 1;
}

export function propostaDaSessao(eventos: SdkEvent[]): PropostaSessao | null {
  const propostas = new Map<string, Proposta>();
  for (const evento of eventos) {
    if (evento.type === 'agent.custom_tool_use' && evento.name === FERRAMENTA) {
      const entrada = parseAbrirMrEntrada(evento.input);
      if (entrada.ok)
        propostas.set(evento.id, { entrada: entrada.valor, resultado: null });
    }
    if (evento.type === 'user.custom_tool_result') {
      const proposta = propostas.get(evento.custom_tool_use_id);
      if (proposta)
        proposta.resultado = {
          erro: evento.is_error === true,
          texto: textoDoResultado(evento.content),
        };
    }
  }

  const todas = [...propostas.values()];
  const mrs = todas.map(p => mrDoResultado(p.resultado));
  const indice = indiceDaMostrada(mrs);
  const mostrada = todas[indice];
  if (!mostrada) return null;

  // The live counter counts every approval. An earlier approval whose result is an error
  // carries no MR, so the session does not count it: this number can be lower by the
  // count of those approvals.
  const anteriores = mrs.slice(0, indice).filter(mr => mr !== null).length;
  return {
    tentativa: anteriores + 1,
    titulo: mostrada.entrada.titulo,
    causa: mostrada.entrada.causa,
    arquivos: mostrada.entrada.arquivos.map(a => a.caminho),
    mr: mrs[indice] ?? null,
  };
}
