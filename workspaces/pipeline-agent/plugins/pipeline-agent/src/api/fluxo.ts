import { ehErroHttp, erroDeRede } from './erros';
import { analisarSse, type QuadroSse } from './sse';

export type OpcoesFluxo = {
  // Opens the stream after the last frame id received, if any.
  abrir: (
    ultimoId: string | undefined,
    sinal: AbortSignal,
  ) => Promise<AsyncIterable<string>>;
  // Returns true when the frame ends the investigation.
  aoQuadro: (quadro: QuadroSse) => boolean;
  sinal: AbortSignal;
  esperar?: (ms: number) => Promise<void>;
  tentativasMax?: number;
};

const TENTATIVAS_MAX = 5;

const esperarMs = (ms: number) =>
  new Promise<void>(resolver => setTimeout(resolver, ms));

const atrasoMs = (falhasSeguidas: number) =>
  Math.min(10_000, 500 * 2 ** (falhasSeguidas - 1));

async function* quadrosDe(
  pedacos: AsyncIterable<string>,
): AsyncGenerator<QuadroSse> {
  let resto = '';
  for await (const pedaco of pedacos) {
    const resultado = analisarSse(resto, pedaco);
    resto = resultado.resto;
    yield* resultado.quadros;
  }
}

// Reads the investigation's frames and reconnects after a drop, sending the
// last frame id as Last-Event-ID. Resolves when a frame ends the investigation
// or the signal aborts. Rejects on an HTTP error, which a reconnect cannot fix,
// and after too many reconnects without a new frame.
export async function acompanharFluxo(opcoes: OpcoesFluxo): Promise<void> {
  const { abrir, aoQuadro, sinal } = opcoes;
  const esperar = opcoes.esperar ?? esperarMs;
  const tentativasMax = opcoes.tentativasMax ?? TENTATIVAS_MAX;
  let ultimoId: string | undefined;
  let semProgresso = 0;

  while (!sinal.aborted) {
    let progrediu = false;
    let quadros: AsyncIterator<QuadroSse> | undefined;

    try {
      quadros = quadrosDe(await abrir(ultimoId, sinal))[Symbol.asyncIterator]();
    } catch (erro) {
      if (sinal.aborted) return;
      if (ehErroHttp(erro)) throw erro;
    }

    while (quadros) {
      let item: IteratorResult<QuadroSse>;
      try {
        item = await quadros.next();
      } catch (erro) {
        if (sinal.aborted) return;
        if (ehErroHttp(erro)) throw erro;
        break;
      }
      if (item.done) break;
      progrediu = true;
      if (item.value.id !== undefined) ultimoId = item.value.id;
      if (aoQuadro(item.value)) return;
    }

    if (sinal.aborted) return;
    semProgresso = progrediu ? 0 : semProgresso + 1;
    if (semProgresso >= tentativasMax) throw erroDeRede();
    await esperar(progrediu ? 0 : atrasoMs(semProgresso));
  }
}
