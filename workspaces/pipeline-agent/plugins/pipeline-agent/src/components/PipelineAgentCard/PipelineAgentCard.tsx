import { useEffect, useState } from 'react';
import Button from '@material-ui/core/Button';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { InfoCard } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import type {
  Banner,
  ItemHistorico,
} from '@veecode-platform/backstage-plugin-pipeline-agent-common';
import { MENSAGEM_NAO_CONFIGURADO } from '../../api/erros';
import { pipelineAgentApiRef } from '../../api';
import { dolar, duracao, tempoAtras } from '../../state/formato';
import { BlocoDiagnostico, DiagnosticoAprovado } from './Diagnostico';
import { Historico } from './Historico';
import { Passos } from './Passos';
import { Resultado } from './Resultado';
import { CARREGANDO, falhaDe, type Carga } from './carga';
import { useEstilos } from './estilos';
import { useDetalhesHistorico } from './useDetalhesHistorico';
import { useInvestigacao } from './useInvestigacao';

export const PipelineAgentCard = () => {
  const { entity } = useEntity();
  const api = useApi(pipelineAgentApiRef);
  const entityRef = stringifyEntityRef(entity);
  const classes = useEstilos();
  const investigacao = useInvestigacao(api, entityRef);
  const detalhes = useDetalhesHistorico(api, entityRef);
  const { visao } = investigacao;
  const terminou = visao.encerrado !== null;

  const [banner, setBanner] = useState<Carga<Banner>>(CARREGANDO);
  const [historico, setHistorico] =
    useState<Carga<ItemHistorico[]>>(CARREGANDO);

  useEffect(() => {
    let vivo = true;
    setBanner(CARREGANDO);
    api.banner(entityRef).then(
      dados => {
        if (vivo) setBanner({ estado: 'pronta', dados });
      },
      falha => {
        if (vivo) setBanner({ estado: 'falhou', falha: falhaDe(falha) });
      },
    );
    return () => {
      vivo = false;
    };
  }, [api, entityRef]);

  // Reloads when an investigation ends, so the finished one appears in it.
  useEffect(() => {
    let vivo = true;
    api.historico(entityRef).then(
      itens => {
        if (vivo) setHistorico({ estado: 'pronta', dados: itens });
      },
      falha => {
        if (vivo) setHistorico({ estado: 'falhou', falha: falhaDe(falha) });
      },
    );
    return () => {
      vivo = false;
    };
  }, [api, entityRef, terminou]);

  // A project the backend does not know gives the card nothing to show.
  if (banner.estado === 'falhou' && banner.falha.tipo === 'ausente') {
    return null;
  }

  const pipeline = banner.estado === 'pronta' ? banner.dados.pipeline : null;
  const naoConfigurado =
    (banner.estado === 'falhou' && banner.falha.tipo === 'nao_configurado') ||
    investigacao.naoConfigurado;
  const mensagemBanner =
    banner.estado === 'falhou' && banner.falha.tipo === 'mensagem'
      ? banner.falha.texto
      : null;
  const semPipelineFalho = banner.estado === 'pronta' && pipeline === null;
  const { diagnostico } = visao;
  const custoDaSessao = dolar(visao.uso?.custoUsd ?? 0);

  const botaoInvestigar = (
    <Button
      variant="contained"
      color="primary"
      disabled={
        naoConfigurado || investigacao.ocupado || investigacao.emAndamento
      }
      onClick={() => investigacao.investigar()}
    >
      Investigar e corrigir
    </Button>
  );

  return (
    <InfoCard
      title="Agente de pipeline"
      subheader="Investiga o pipeline que falhou e propõe a correção. Só abre um MR depois que você aprovar."
    >
      <div className={classes.corpo}>
        {naoConfigurado && (
          <p className={classes.subtitulo}>{MENSAGEM_NAO_CONFIGURADO}</p>
        )}
        {mensagemBanner !== null && (
          <p className={classes.erro}>{mensagemBanner}</p>
        )}
        {!naoConfigurado && investigacao.erro !== null && (
          <p className={classes.erro}>{investigacao.erro}</p>
        )}

        {pipeline !== null && (
          <div className={classes.faixa} role="alert">
            <p className={classes.texto}>
              O pipeline falhou no job {pipeline.job.nome} há{' '}
              {tempoAtras(pipeline.haMinutos)}. Último commit: &quot;
              {pipeline.commit.titulo}&quot;.
            </p>
            {botaoInvestigar}
          </div>
        )}
        {pipeline === null && naoConfigurado && (
          <div className={classes.acoes}>{botaoInvestigar}</div>
        )}
        {semPipelineFalho && (
          <p className={classes.subtitulo}>
            Nenhum pipeline com falha neste serviço agora.
          </p>
        )}

        {visao.passos.length > 0 && <Passos passos={visao.passos} />}
        {visao.orientacoes.map((texto, i) => (
          <p key={`orientacao-${i}`} className={classes.subtitulo}>
            {`Você orientou o agente: "${texto}"`}
          </p>
        ))}
        {diagnostico !== null && (
          <BlocoDiagnostico
            diagnostico={diagnostico}
            ocupado={investigacao.ocupado}
            onAprovar={() => investigacao.aprovar(diagnostico.ferramentaId)}
            onRecusar={motivo =>
              investigacao.recusar(diagnostico.ferramentaId, motivo)
            }
            onOrientar={texto =>
              investigacao.orientar(diagnostico.ferramentaId, texto)
            }
          />
        )}
        <Resultado visao={visao} />
        {visao.aprovado !== null && (
          <DiagnosticoAprovado diagnostico={visao.aprovado} />
        )}

        {investigacao.temSessao && visao.verdeSegundos !== null && (
          <p className={classes.rodape}>
            Do clique ao pipeline verde: {duracao(visao.verdeSegundos)}. Custo
            da investigação: {custoDaSessao}.
          </p>
        )}
        {investigacao.temSessao && visao.verdeSegundos === null && (
          <p className={classes.rodape}>
            Tempo desde o clique: {duracao(investigacao.segundosAteVerde)}.
            Custo até agora: {custoDaSessao}.
          </p>
        )}

        <Historico
          carga={historico}
          detalhe={detalhes.detalhe}
          aoAbrir={detalhes.abrir}
        />
      </div>
    </InfoCard>
  );
};
