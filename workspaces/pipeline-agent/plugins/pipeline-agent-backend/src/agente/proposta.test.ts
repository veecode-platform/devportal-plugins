import { propostaDaSessao } from './proposta';
import type { SdkEvent } from './types';

const CAUSA = 'Causa: a faixa é aplicada sobre o valor já descontado.';
const ARQUIVO = {
  caminho: 'src/main/java/br/com/exemplo/pedidos/DescontoService.java',
  conteudo: 'class DescontoService {}',
};

function proposta(id: string, titulo = 'fix: soma sobre o bruto'): SdkEvent {
  return {
    id,
    type: 'agent.custom_tool_use',
    name: 'abrir_mr',
    input: { titulo, causa: CAUSA, arquivos: [ARQUIVO] },
    processed_at: 'p',
  } as unknown as SdkEvent;
}

function propostaInvalida(id: string): SdkEvent {
  return {
    id,
    type: 'agent.custom_tool_use',
    name: 'abrir_mr',
    input: { titulo: 'fix', causa: CAUSA, arquivos: [] },
    processed_at: 'p',
  } as unknown as SdkEvent;
}

function resposta(usoId: string, texto: string, erro = false): SdkEvent {
  return {
    id: `evt_${usoId}`,
    type: 'user.custom_tool_result',
    custom_tool_use_id: usoId,
    content: [{ type: 'text', text: texto }],
    is_error: erro,
    processed_at: 'p',
  } as unknown as SdkEvent;
}

const ABERTO = (iid: number, status: string) =>
  JSON.stringify({ mr_iid: iid, pipeline_status: status });

describe('propostaDaSessao', () => {
  it('answers null for a session that never proposed a merge request', () => {
    expect(
      propostaDaSessao([
        {
          id: 'evt_1',
          type: 'agent.message',
          content: [{ type: 'text', text: 'Olhando o log.' }],
          processed_at: 'p',
        } as unknown as SdkEvent,
      ]),
    ).toBeNull();
  });

  it('reads the title, cause and file paths, and the merge request its result opened', () => {
    const eventos = [
      proposta('toolu_1', 'fix: cupom e faixa somam sobre o valor bruto'),
      resposta('toolu_1', ABERTO(2, 'success')),
    ];

    expect(propostaDaSessao(eventos)).toEqual({
      tentativa: 1,
      titulo: 'fix: cupom e faixa somam sobre o valor bruto',
      causa: CAUSA,
      arquivos: [ARQUIVO.caminho],
      mr: { iid: 2, statusPipeline: 'success' },
    });
  });

  it('uses the last proposal that opened a merge request, after an earlier refusal', () => {
    const eventos = [
      proposta('toolu_1', 'fix: primeira'),
      resposta('toolu_1', 'A pessoa recusou a proposta.', true),
      proposta('toolu_2', 'fix: segunda'),
      resposta('toolu_2', ABERTO(5, 'failed')),
    ];

    expect(propostaDaSessao(eventos)).toMatchObject({
      titulo: 'fix: segunda',
      mr: { iid: 5, statusPipeline: 'failed' },
    });
  });

  it('shows the merge request an earlier attempt opened, not a later refusal', () => {
    const eventos = [
      proposta('toolu_1', 'fix: primeira'),
      resposta('toolu_1', ABERTO(4, 'failed')),
      proposta('toolu_2', 'fix: segunda'),
      resposta('toolu_2', 'A pessoa recusou a proposta. Motivo: nao.', true),
    ];

    expect(propostaDaSessao(eventos)).toEqual({
      tentativa: 1,
      titulo: 'fix: primeira',
      causa: CAUSA,
      arquivos: [ARQUIVO.caminho],
      mr: { iid: 4, statusPipeline: 'failed' },
    });
  });

  it('shows the third red merge request, not the attempt-limit answer that came after it', () => {
    const eventos = [
      proposta('toolu_1', 'fix: primeira'),
      resposta('toolu_1', ABERTO(1, 'failed')),
      proposta('toolu_2', 'fix: segunda'),
      resposta('toolu_2', ABERTO(2, 'failed')),
      proposta('toolu_3', 'fix: terceira'),
      resposta('toolu_3', ABERTO(3, 'failed')),
      proposta('toolu_4', 'fix: quarta'),
      resposta(
        'toolu_4',
        'Limite de tentativas atingido. Não abra outro MR: escreva o diagnóstico.',
      ),
    ];

    expect(propostaDaSessao(eventos)).toEqual({
      tentativa: 3,
      titulo: 'fix: terceira',
      causa: CAUSA,
      arquivos: [ARQUIVO.caminho],
      mr: { iid: 3, statusPipeline: 'failed' },
    });
  });

  it('shows the last proposal when no attempt opened a merge request', () => {
    const eventos = [
      proposta('toolu_1', 'fix: primeira'),
      resposta('toolu_1', 'A pessoa recusou a proposta.', true),
      proposta('toolu_2', 'fix: segunda'),
      resposta('toolu_2', 'Falha ao abrir o MR: a API não respondeu.', true),
    ];

    expect(propostaDaSessao(eventos)).toMatchObject({
      tentativa: 1,
      titulo: 'fix: segunda',
      mr: null,
    });
  });

  it('answers no merge request for a refused proposal', () => {
    const eventos = [
      proposta('toolu_1'),
      resposta('toolu_1', 'A pessoa recusou a proposta. Motivo: nao.', true),
    ];

    expect(propostaDaSessao(eventos)).toMatchObject({ mr: null });
  });

  it('answers no merge request for a proposal still waiting for a decision', () => {
    expect(propostaDaSessao([proposta('toolu_1')])).toMatchObject({ mr: null });
  });

  it('answers no merge request for the attempt-limit answer, which has no merge request', () => {
    const eventos = [
      proposta('toolu_1'),
      resposta(
        'toolu_1',
        'Limite de tentativas atingido. Não abra outro MR: escreva o diagnóstico.',
      ),
    ];

    expect(propostaDaSessao(eventos)).toMatchObject({ mr: null });
  });

  it('skips an input the boundary parser rejects, so the proposal before it is the last one', () => {
    const eventos = [
      proposta('toolu_1', 'fix: a proposta valida'),
      resposta('toolu_1', ABERTO(7, 'success')),
      propostaInvalida('toolu_2'),
      resposta(
        'toolu_2',
        'Entrada inválida: arquivos precisa ter de 1 a 10 itens.',
        true,
      ),
    ];

    expect(propostaDaSessao(eventos)).toMatchObject({
      titulo: 'fix: a proposta valida',
      mr: { iid: 7, statusPipeline: 'success' },
    });
  });

  it('numbers the attempt after the merge requests the earlier proposals opened', () => {
    const eventos = [
      proposta('toolu_1'),
      resposta('toolu_1', ABERTO(1, 'failed')),
      proposta('toolu_2'),
      resposta('toolu_2', 'A pessoa recusou a proposta.', true),
      proposta('toolu_3'),
      resposta('toolu_3', ABERTO(2, 'failed')),
      proposta('toolu_4'),
      resposta('toolu_4', ABERTO(3, 'success')),
    ];

    expect(propostaDaSessao(eventos)).toMatchObject({
      tentativa: 3,
      mr: { iid: 3, statusPipeline: 'success' },
    });
  });
});
