import type { UiEvent } from '@veecode-platform/backstage-plugin-pipeline-agent-common';
import { reduzir, VISAO_INICIAL, type Visao } from './visao';

const aplicar = (eventos: UiEvent[], inicial: Visao = VISAO_INICIAL): Visao =>
  eventos.reduce(reduzir, inicial);

const diagnostico = (
  tentativa: number,
  ferramentaId = `toolu_${tentativa}`,
): UiEvent => ({
  tipo: 'diagnostico',
  ferramentaId,
  titulo: 'fix: cupom e faixa somam sobre o valor bruto',
  causa: 'A faixa é aplicada sobre o valor já descontado.',
  tentativa,
  arquivos: [
    {
      caminho: 'src/main/java/DescontoService.java',
      novo: false,
      diff: '-antes\n+depois',
    },
  ],
});

describe('reduzir', () => {
  it('records the phase', () => {
    const visao = aplicar([{ tipo: 'fase', fase: 'aguardando_aprovacao' }]);

    expect(visao.fase).toBe('aguardando_aprovacao');
  });

  it('appends a plain step in order', () => {
    const visao = aplicar([
      { tipo: 'passo', id: 'p1', texto: 'Vou ver o log do job test.' },
      { tipo: 'passo', id: 'p2', texto: 'O teste recebeu 902,50.' },
    ]);

    expect(visao.passos).toEqual([
      { tipo: 'passo', id: 'p1', texto: 'Vou ver o log do job test.' },
      { tipo: 'passo', id: 'p2', texto: 'O teste recebeu 902,50.' },
    ]);
  });

  it('adds a command without output, then fills only its own output', () => {
    const visao = aplicar([
      {
        tipo: 'comando',
        id: 'c1',
        resumo: 'Consultou a API',
        comando: 'curl a',
      },
      {
        tipo: 'comando',
        id: 'c2',
        resumo: 'Rodou o teste',
        comando: 'mvn test',
      },
      { tipo: 'comando_saida', id: 'c2', saida: 'BUILD FAILURE' },
    ]);

    expect(visao.passos).toEqual([
      {
        tipo: 'comando',
        id: 'c1',
        resumo: 'Consultou a API',
        comando: 'curl a',
        saida: null,
      },
      {
        tipo: 'comando',
        id: 'c2',
        resumo: 'Rodou o teste',
        comando: 'mvn test',
        saida: 'BUILD FAILURE',
      },
    ]);
  });

  it('shows a diagnosis with its attempt number and files', () => {
    const visao = aplicar([diagnostico(1)]);

    expect(visao.diagnostico).toEqual({
      ferramentaId: 'toolu_1',
      titulo: 'fix: cupom e faixa somam sobre o valor bruto',
      causa: 'A faixa é aplicada sobre o valor já descontado.',
      tentativa: 1,
      arquivos: [
        {
          caminho: 'src/main/java/DescontoService.java',
          novo: false,
          diff: '-antes\n+depois',
        },
      ],
    });
  });

  it('clears the diagnosis on guidance and keeps the guidance text', () => {
    const visao = aplicar([
      diagnostico(1),
      { tipo: 'orientacao', texto: 'Olhe o teste de novo.' },
    ]);

    expect(visao.diagnostico).toBeNull();
    expect(visao.orientacoes).toEqual(['Olhe o teste de novo.']);
  });

  it('clears the diagnosis on refusal and keeps the reason', () => {
    const visao = aplicar([
      diagnostico(1),
      { tipo: 'recusa', motivo: 'A correção muda o contrato da API.' },
    ]);

    expect(visao.diagnostico).toBeNull();
    expect(visao.recusa).toBe('A correção muda o contrato da API.');
  });

  it('moves an approved diagnosis aside when the MR opens', () => {
    const visao = aplicar([
      diagnostico(1),
      { tipo: 'mr_aberto', iid: 3, titulo: 'fix: cupom', url: 'https://x/3' },
    ]);

    expect(visao.diagnostico).toBeNull();
    expect(visao.aprovado?.ferramentaId).toBe('toolu_1');
    expect(visao.mr).toEqual({
      iid: 3,
      titulo: 'fix: cupom',
      url: 'https://x/3',
    });
  });

  it('keeps the earlier approved diagnosis when no diagnosis is pending', () => {
    const visao = aplicar([
      diagnostico(1, 'toolu_a'),
      { tipo: 'mr_aberto', iid: 3, titulo: 'fix', url: 'https://x/3' },
      { tipo: 'mr_aberto', iid: 4, titulo: 'fix 2', url: 'https://x/4' },
    ]);

    expect(visao.aprovado?.ferramentaId).toBe('toolu_a');
    expect(visao.mr?.iid).toBe(4);
  });

  it('replaces the pipeline with each new pipeline_mr and clears it on a new MR', () => {
    const visao = aplicar([
      {
        tipo: 'pipeline_mr',
        pipelineId: 9102,
        status: 'running',
        url: null,
        jobs: [],
        jobFalho: null,
      },
      {
        tipo: 'pipeline_mr',
        pipelineId: 9102,
        status: 'success',
        url: 'https://x/pipelines/9102',
        jobs: ['build', 'test'],
        jobFalho: null,
      },
    ]);

    expect(visao.pipeline).toEqual({
      pipelineId: 9102,
      status: 'success',
      url: 'https://x/pipelines/9102',
      jobs: ['build', 'test'],
      jobFalho: null,
    });

    const novoMr = aplicar(
      [{ tipo: 'mr_aberto', iid: 5, titulo: 'x', url: 'https://x/5' }],
      visao,
    );
    expect(novoMr.pipeline).toBeNull();
  });

  it('stores the time to green, the usage, the end reason and the error', () => {
    const visao = aplicar([
      { tipo: 'verde', segundos: 11 },
      {
        tipo: 'uso',
        tokensEntrada: 52000,
        tokensSaida: 4100,
        tokensCacheLeitura: 260000,
        tokensCacheEscrita: 6000,
        segundosAtivos: 11,
        custoUsd: 0.04,
      },
      { tipo: 'encerrado', motivo: 'agente encerrou o turno' },
      { tipo: 'erro', mensagem: 'O GitLab não respondeu.' },
    ]);

    expect(visao.verdeSegundos).toBe(11);
    expect(visao.uso?.custoUsd).toBe(0.04);
    expect(visao.encerrado).toBe('agente encerrou o turno');
    expect(visao.erro).toBe('O GitLab não respondeu.');
  });
});
