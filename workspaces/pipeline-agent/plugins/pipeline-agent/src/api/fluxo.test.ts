import { PipelineAgentError } from './erros';
import { acompanharFluxo } from './fluxo';

async function* pedacos(...itens: (string | Error)[]): AsyncGenerator<string> {
  for (const item of itens) {
    if (item instanceof Error) throw item;
    yield item;
  }
}

const sinalLivre = () => new AbortController().signal;
const semEspera = async () => undefined;

describe('acompanharFluxo', () => {
  it('reconnects after a drop and sends the last frame id it received', async () => {
    const aberturas: (string | undefined)[] = [];
    const recebidos: string[] = [];
    const abrir = jest
      .fn()
      .mockImplementationOnce(async (ultimoId: string | undefined) => {
        aberturas.push(ultimoId);
        return pedacos('id: 1\ndata: A\n\nid: 2\ndata: B\n\n');
      })
      .mockImplementationOnce(async (ultimoId: string | undefined) => {
        aberturas.push(ultimoId);
        return pedacos('id: 3\ndata: C\n\n');
      });

    await acompanharFluxo({
      abrir,
      aoQuadro: quadro => {
        recebidos.push(quadro.data);
        return quadro.data === 'C';
      },
      sinal: sinalLivre(),
      esperar: semEspera,
    });

    expect(aberturas).toEqual([undefined, '2']);
    expect(recebidos).toEqual(['A', 'B', 'C']);
  });

  it('reconnects when the connection breaks in the middle of a frame', async () => {
    const aberturas: (string | undefined)[] = [];
    const recebidos: string[] = [];
    const abrir = jest
      .fn()
      .mockImplementationOnce(async (ultimoId: string | undefined) => {
        aberturas.push(ultimoId);
        return pedacos('id: 4\ndata: A\n\nid: 5\nda', new TypeError('network'));
      })
      .mockImplementationOnce(async (ultimoId: string | undefined) => {
        aberturas.push(ultimoId);
        return pedacos('id: 5\ndata: B\n\n');
      });

    await acompanharFluxo({
      abrir,
      aoQuadro: quadro => {
        recebidos.push(quadro.data);
        return quadro.data === 'B';
      },
      sinal: sinalLivre(),
      esperar: semEspera,
    });

    expect(aberturas).toEqual([undefined, '4']);
    expect(recebidos).toEqual(['A', 'B']);
  });

  it('stops at once on an HTTP error, because a reconnect cannot fix it', async () => {
    const abrir = jest
      .fn()
      .mockRejectedValue(new PipelineAgentError(403, 'sem permissão'));

    await expect(
      acompanharFluxo({
        abrir,
        aoQuadro: () => false,
        sinal: sinalLivre(),
        esperar: semEspera,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it('gives up after too many reconnects without a new frame', async () => {
    const abrir = jest.fn().mockRejectedValue(new TypeError('offline'));

    await expect(
      acompanharFluxo({
        abrir,
        aoQuadro: () => false,
        sinal: sinalLivre(),
        esperar: semEspera,
        tentativasMax: 3,
      }),
    ).rejects.toMatchObject({ status: 0 });
    expect(abrir).toHaveBeenCalledTimes(3);
  });

  it('does not open the stream once the signal is aborted', async () => {
    const controlador = new AbortController();
    controlador.abort();
    const abrir = jest.fn();

    await acompanharFluxo({
      abrir,
      aoQuadro: () => false,
      sinal: controlador.signal,
      esperar: semEspera,
    });

    expect(abrir).not.toHaveBeenCalled();
  });
});
