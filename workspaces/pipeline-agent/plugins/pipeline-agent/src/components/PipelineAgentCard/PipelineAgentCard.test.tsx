import type { Entity } from '@backstage/catalog-model';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  Banner,
  ItemHistorico,
  UiEvent,
} from '@veecode-platform/backstage-plugin-pipeline-agent-common';
import {
  PipelineAgentError,
  pipelineAgentApiRef,
  type PipelineAgentApi,
} from '../../api';
import {
  erroDeRede,
  MENSAGEM_NAO_CONFIGURADO,
  MENSAGEM_SEM_PERMISSAO,
} from '../../api/erros';
import { PipelineAgentCard } from './PipelineAgentCard';

const ENTIDADE: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'pedidos-api',
    namespace: 'default',
    annotations: {
      'gitlab.com/project-slug': 'veecode-demos/pedidos-api',
      'veecode.io/pipeline-agent': 'enabled',
    },
  },
  spec: { type: 'service', lifecycle: 'experimental', owner: 'guest' },
};

const BANNER_FALHO: Banner = {
  projeto: 'veecode-demos/pedidos-api',
  pipeline: {
    id: 9001,
    ref: 'main',
    criadoEm: '2026-10-21T12:00:00.000Z',
    haMinutos: 14,
    job: { id: 5531, nome: 'test' },
    commit: {
      sha: '3c9e0a7f5d1b2e8c4a6f0d9b7e5c3a1f8d2b4e6c',
      titulo: 'feat: desconto por faixa acumulado com cupom',
    },
  },
};

const DIAGNOSTICO: UiEvent = {
  tipo: 'diagnostico',
  ferramentaId: 'tool-1',
  titulo: 'Somar os dois descontos sobre o valor bruto',
  causa: 'A faixa de 5% sai sobre o valor que o cupom já descontou.',
  tentativa: 1,
  arquivos: [
    {
      caminho: 'src/main/java/br/com/exemplo/pedidos/DescontoService.java',
      novo: false,
      diff: '@@ -16,3 +16,3 @@\n-    var base = comCupom;\n+    var base = bruto;',
    },
  ],
};

const MR_ABERTO: UiEvent = {
  tipo: 'mr_aberto',
  iid: 3,
  titulo: 'fix: cupom e faixa somam sobre o valor bruto',
  url: 'https://gitlab.example.com/veecode-demos/pedidos-api/-/merge_requests/3',
};

// Replays the given events as soon as the card follows the investigation, then
// stays open until the card unmounts, as a live stream does.
const acompanharCom =
  (eventos: UiEvent[]): PipelineAgentApi['acompanhar'] =>
  async (_id, aoEvento, sinal) => {
    for (const evento of eventos) aoEvento(evento);
    await new Promise<void>(resolver =>
      sinal.addEventListener('abort', () => resolver()),
    );
  };

const criarApi = (sobrescritos: Partial<PipelineAgentApi> = {}) => {
  const api: PipelineAgentApi = {
    banner: jest.fn().mockResolvedValue(BANNER_FALHO),
    historico: jest.fn().mockResolvedValue([]),
    iniciar: jest.fn().mockResolvedValue({
      id: 'inv-1',
      iniciadoEm: '2026-10-21T12:00:00.000Z',
    }),
    acompanhar: acompanharCom([]),
    aprovar: jest.fn().mockResolvedValue('abrindo_mr'),
    recusar: jest.fn().mockResolvedValue('investigando'),
    orientar: jest.fn().mockResolvedValue('investigando'),
    ...sobrescritos,
  };
  return api;
};

const renderizar = (api: PipelineAgentApi) =>
  renderInTestApp(
    <TestApiProvider apis={[[pipelineAgentApiRef, api]]}>
      <EntityProvider entity={ENTIDADE}>
        <PipelineAgentCard />
      </EntityProvider>
    </TestApiProvider>,
  );

const botaoInvestigar = () =>
  screen.findByRole('button', { name: 'Investigar e corrigir' });

describe('PipelineAgentCard', () => {
  it('offers the investigation for a failed pipeline', async () => {
    renderizar(criarApi());

    expect(await botaoInvestigar()).toBeEnabled();
    expect(
      screen.getByText(
        /Pipeline falhou no job test · commit "feat: desconto por faixa acumulado com cupom" · há 14 min/,
      ),
    ).toBeInTheDocument();
  });

  it('shows the steps of a running investigation with their commands', async () => {
    const user = userEvent.setup();
    renderizar(
      criarApi({
        acompanhar: acompanharCom([
          { tipo: 'fase', fase: 'investigando' },
          {
            tipo: 'passo',
            id: 'p1',
            texto: 'Vou ler o log do job test.',
          },
          {
            tipo: 'comando',
            id: 'c1',
            resumo: 'Consultou a API do GitLab',
            comando: 'curl -s .../jobs/5531/trace',
          },
          {
            tipo: 'comando_saida',
            id: 'c1',
            saida: 'Tests run: 7, Failures: 1',
          },
        ]),
      }),
    );

    await user.click(await botaoInvestigar());

    expect(
      await screen.findByText('Vou ler o log do job test.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Consultou a API do GitLab')).toBeInTheDocument();
    expect(screen.getByText('Tests run: 7, Failures: 1')).toBeInTheDocument();
    expect(screen.getAllByText('Ver comando e saída')).toHaveLength(1);
  });

  it('shows the three decisions for a diagnosis', async () => {
    const user = userEvent.setup();
    renderizar(criarApi({ acompanhar: acompanharCom([DIAGNOSTICO]) }));

    await user.click(await botaoInvestigar());

    expect(
      await screen.findByRole('button', { name: 'Aprovar e abrir MR' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Orientar o agente' }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeEnabled();
    expect(
      screen.getByText(
        'A faixa de 5% sai sobre o valor que o cupom já descontou.',
      ),
    ).toBeInTheDocument();
  });

  it('approves the pending proposal by its toolUseId', async () => {
    const user = userEvent.setup();
    const api = criarApi({ acompanhar: acompanharCom([DIAGNOSTICO]) });
    renderizar(api);

    await user.click(await botaoInvestigar());
    await user.click(
      await screen.findByRole('button', { name: 'Aprovar e abrir MR' }),
    );

    await waitFor(() =>
      expect(api.aprovar).toHaveBeenCalledWith('inv-1', 'tool-1'),
    );
  });

  it('sends the reason of a refusal with the toolUseId', async () => {
    const user = userEvent.setup();
    const api = criarApi({ acompanhar: acompanharCom([DIAGNOSTICO]) });
    renderizar(api);

    await user.click(await botaoInvestigar());
    await user.click(await screen.findByRole('button', { name: 'Recusar' }));
    await user.type(
      screen.getByLabelText('Motivo da recusa'),
      'Não cobre o caso do cupom',
    );
    await user.click(screen.getByRole('button', { name: 'Confirmar recusa' }));

    await waitFor(() =>
      expect(api.recusar).toHaveBeenCalledWith(
        'inv-1',
        'tool-1',
        'Não cobre o caso do cupom',
      ),
    );
  });

  it('collapses the approved diagnosis once the merge request opens', async () => {
    const user = userEvent.setup();
    renderizar(
      criarApi({
        acompanhar: acompanharCom([DIAGNOSTICO, MR_ABERTO]),
      }),
    );

    await user.click(await botaoInvestigar());

    expect(
      await screen.findByText('Diagnóstico e mudança aprovados'),
    ).toBeInTheDocument();
    expect(screen.getByText(/MR !3 aberto/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Aprovar e abrir MR' }),
    ).not.toBeInTheDocument();
  });

  it('disables the investigation when the backend is not configured', async () => {
    renderizar(
      criarApi({
        banner: jest
          .fn()
          .mockRejectedValue(
            new PipelineAgentError(503, MENSAGEM_NAO_CONFIGURADO),
          ),
      }),
    );

    expect(
      await screen.findByText(MENSAGEM_NAO_CONFIGURADO),
    ).toBeInTheDocument();
    expect(await botaoInvestigar()).toBeDisabled();
  });

  it('renders nothing when the backend does not know the project', async () => {
    const { container } = await renderizar(
      criarApi({
        banner: jest
          .fn()
          .mockRejectedValue(
            new PipelineAgentError(404, 'Esta investigação não existe mais.'),
          ),
      }),
    );

    await waitFor(() =>
      expect(screen.queryByText('Agente de pipeline')).not.toBeInTheDocument(),
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the permission message when the user cannot see the agent', async () => {
    renderizar(
      criarApi({
        banner: jest
          .fn()
          .mockRejectedValue(
            new PipelineAgentError(403, MENSAGEM_SEM_PERMISSAO),
          ),
      }),
    );

    expect(
      await screen.findByText('Você não tem permissão para esta ação.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Investigar e corrigir' }),
    ).not.toBeInTheDocument();
  });

  it('shows a network message when the backend does not answer', async () => {
    renderizar(
      criarApi({
        banner: jest.fn().mockRejectedValue(erroDeRede()),
      }),
    );

    expect(
      await screen.findByText(
        'Não consegui falar com o agente. Verifique a conexão e tente de novo.',
      ),
    ).toBeInTheDocument();
  });

  it('shows a readable message when the event reducer fails', async () => {
    const user = userEvent.setup();
    renderizar(
      criarApi({
        acompanhar: async (_id, aoEvento) => {
          aoEvento({ tipo: 'evento_sem_nome' } as unknown as UiEvent);
        },
      }),
    );

    await user.click(await botaoInvestigar());

    expect(
      await screen.findByText(/Algo inesperado aconteceu com o agente/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Evento sem tratamento/)).not.toBeInTheDocument();
  });

  it('lists the finished investigations with their pt-BR status', async () => {
    const historico: ItemHistorico[] = [
      {
        id: 'h1',
        titulo: 'fix: cupom e faixa somam sobre o valor bruto',
        criadoEm: '2026-10-20T12:00:00.000Z',
        status: 'idle',
        custoUsd: 0.31,
      },
    ];
    renderizar(criarApi({ historico: jest.fn().mockResolvedValue(historico) }));

    expect(
      await screen.findByText('fix: cupom e faixa somam sobre o valor bruto'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Concluída/)).toBeInTheDocument();
    expect(screen.getByText(/US\$ 0,31/)).toBeInTheDocument();
  });
});
