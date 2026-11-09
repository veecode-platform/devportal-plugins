import { useEffect, useRef, useState } from 'react';
import { PipelineAgentError, type PipelineAgentApi } from '../../api';
import { reduzir, VISAO_INICIAL, type Visao } from '../../state/visao';
import { mensagemDe } from './carga';

type Sessao = { id: string; iniciadoEm: number };

// Owns one investigation: starting it, following its event log, and sending the
// decisions the user makes on the pending proposal.
export function useInvestigacao(api: PipelineAgentApi, entityRef: string) {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [visao, setVisao] = useState<Visao>(VISAO_INICIAL);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [naoConfigurado, setNaoConfigurado] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());
  // The reducer runs inside the event callback, not in a state updater, so a
  // throw from it rejects acompanhar instead of breaking the render.
  const visaoAtual = useRef<Visao>(VISAO_INICIAL);

  useEffect(() => {
    if (!sessao) return undefined;
    const controle = new AbortController();
    visaoAtual.current = VISAO_INICIAL;
    setVisao(VISAO_INICIAL);
    api
      .acompanhar(
        sessao.id,
        evento => {
          const proxima = reduzir(visaoAtual.current, evento);
          visaoAtual.current = proxima;
          setVisao(proxima);
        },
        controle.signal,
      )
      .catch(falha => {
        if (controle.signal.aborted) return;
        setErro(mensagemDe(falha));
      });
    return () => controle.abort();
  }, [api, sessao]);

  const emAndamento = sessao !== null && visao.encerrado === null;

  useEffect(() => {
    if (!emAndamento) return undefined;
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(relogio);
  }, [emAndamento]);

  const executar = async (acao: () => Promise<unknown>) => {
    setOcupado(true);
    setErro(null);
    setNaoConfigurado(false);
    try {
      await acao();
    } catch (falha) {
      setNaoConfigurado(
        falha instanceof PipelineAgentError && falha.status === 503,
      );
      setErro(mensagemDe(falha));
    } finally {
      setOcupado(false);
    }
  };

  const decidir = (acao: (id: string) => Promise<unknown>) =>
    sessao ? executar(() => acao(sessao.id)) : Promise.resolve();

  const segundosAteVerde =
    visao.verdeSegundos ?? (sessao ? (agora - sessao.iniciadoEm) / 1000 : 0);

  return {
    visao,
    temSessao: sessao !== null,
    emAndamento,
    ocupado,
    erro,
    naoConfigurado,
    segundosAteVerde,
    investigar: () =>
      executar(async () => {
        const resposta = await api.iniciar(entityRef);
        setSessao({
          id: resposta.id,
          iniciadoEm: Date.parse(resposta.iniciadoEm),
        });
      }),
    aprovar: (toolUseId: string) => decidir(id => api.aprovar(id, toolUseId)),
    recusar: (toolUseId: string, motivo: string) =>
      decidir(id => api.recusar(id, toolUseId, motivo)),
    orientar: (toolUseId: string, texto: string) =>
      decidir(id => api.orientar(id, toolUseId, texto)),
  };
}
