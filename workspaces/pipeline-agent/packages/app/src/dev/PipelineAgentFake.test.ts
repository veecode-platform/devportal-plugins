import {
  PipelineAgentError,
  type UiEvent,
} from '@veecode-platform/backstage-plugin-pipeline-agent';
import { PipelineAgentFake } from './PipelineAgentFake';

const ENTIDADE = 'component:default/pedidos-api';

const semCancelar = () => new AbortController().signal;

const ultimoDiagnostico = (eventos: UiEvent[]) =>
  eventos.filter(e => e.tipo === 'diagnostico').at(-1);

// Answers each wait for a decision with the given action, then records the events.
async function investigar(
  fake: PipelineAgentFake,
  decidir: (id: string, toolUseId: string, espera: number) => void,
) {
  const { id } = await fake.iniciar(ENTIDADE);
  const eventos: UiEvent[] = [];
  let esperas = 0;
  await fake.acompanhar(
    id,
    evento => {
      eventos.push(evento);
      if (evento.tipo === 'fase' && evento.fase === 'aguardando_aprovacao') {
        esperas += 1;
        const diagnostico = ultimoDiagnostico(eventos);
        if (diagnostico?.tipo === 'diagnostico') {
          decidir(id, diagnostico.ferramentaId, esperas);
        }
      }
    },
    semCancelar(),
  );
  return { id, eventos };
}

describe('PipelineAgentFake', () => {
  it('plays the failed pipeline, the approval, the merge request and the green pipeline', async () => {
    const fake = new PipelineAgentFake({ passoMs: 0 });

    const { eventos } = await investigar(fake, (id, toolUseId) => {
      void fake.aprovar(id, toolUseId);
    });

    const diagnostico = ultimoDiagnostico(eventos);
    expect(diagnostico).toMatchObject({
      tipo: 'diagnostico',
      tentativa: 1,
      arquivos: [
        {
          caminho: 'src/main/java/br/com/exemplo/pedidos/DescontoService.java',
          novo: false,
        },
      ],
    });
    expect(eventos).toContainEqual(
      expect.objectContaining({ tipo: 'mr_aberto', iid: 3 }),
    );
    expect(eventos).toContainEqual(
      expect.objectContaining({
        tipo: 'pipeline_mr',
        status: 'success',
        jobs: ['build', 'test'],
      }),
    );
    expect(eventos.find(e => e.tipo === 'verde')).toBeDefined();
    expect(eventos.at(-1)).toEqual({
      tipo: 'encerrado',
      motivo: 'agente encerrou o turno',
    });
  });

  it('refuses a decision that names a stale toolUseId with a 409', async () => {
    const fake = new PipelineAgentFake({ passoMs: 0 });
    const erros: unknown[] = [];

    await investigar(fake, (id, toolUseId) => {
      fake.aprovar(id, 'toolu_antigo').catch(erro => erros.push(erro));
      void fake.aprovar(id, toolUseId);
    });

    expect(erros[0]).toBeInstanceOf(PipelineAgentError);
    expect(erros[0]).toMatchObject({ status: 409 });
  });

  it('ends the session without a merge request when the proposal is refused', async () => {
    const fake = new PipelineAgentFake({ passoMs: 0 });

    const { eventos } = await investigar(fake, (id, toolUseId) => {
      void fake.recusar(id, toolUseId, 'A correção muda o contrato da API.');
    });

    expect(eventos).toContainEqual({
      tipo: 'recusa',
      motivo: 'A correção muda o contrato da API.',
    });
    expect(eventos.some(e => e.tipo === 'mr_aberto')).toBe(false);
    expect(eventos.at(-1)).toMatchObject({ tipo: 'encerrado' });
  });

  it('sends guidance back and opens a second proposal before the merge request', async () => {
    const fake = new PipelineAgentFake({ passoMs: 0 });

    const { eventos } = await investigar(fake, (id, toolUseId, espera) => {
      if (espera === 1) {
        void fake.orientar(id, toolUseId, 'Olhe o teste de fronteira.');
      } else {
        void fake.aprovar(id, toolUseId);
      }
    });

    expect(eventos).toContainEqual({
      tipo: 'orientacao',
      texto: 'Olhe o teste de fronteira.',
    });
    expect(ultimoDiagnostico(eventos)).toMatchObject({ tentativa: 2 });
    expect(eventos.some(e => e.tipo === 'mr_aberto')).toBe(true);
  });

  it('lists the finished session in the history with its merge request', async () => {
    const fake = new PipelineAgentFake({ passoMs: 0 });

    await investigar(fake, (id, toolUseId) => {
      void fake.aprovar(id, toolUseId);
    });
    const historico = await fake.historico(ENTIDADE);

    expect(historico[0]).toMatchObject({
      titulo: 'Pipeline 9001 · job test · MR !3 aberto',
      status: 'idle',
    });
  });

  it('reports an unknown investigation as not found', async () => {
    const fake = new PipelineAgentFake({ passoMs: 0 });

    await expect(
      fake.acompanhar('inexistente', () => undefined, semCancelar()),
    ).rejects.toMatchObject({ status: 404 });
  });
});
