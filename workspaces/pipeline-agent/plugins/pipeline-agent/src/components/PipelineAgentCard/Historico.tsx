import { useState } from 'react';
import Typography from '@material-ui/core/Typography';
import type {
  DetalheHistorico,
  ItemHistorico,
} from '@veecode-platform/backstage-plugin-pipeline-agent-common';
import { MENSAGEM_NAO_CONFIGURADO } from '../../api/erros';
import { dataCurta, dolar } from '../../state/formato';
import { rotuloPipeline, rotuloSessao } from '../../state/rotulos';
import { type Carga, type Falha } from './carga';
import { useEstilos } from './estilos';

// A 404 or a 503 is not a history error: the card already says what is wrong,
// so the history block stays out of the way.
export function Historico({
  carga,
  detalhe,
  aoAbrir,
}: {
  carga: Carga<ItemHistorico[]>;
  detalhe: (id: string) => Carga<DetalheHistorico> | undefined;
  aoAbrir: (id: string) => void;
}) {
  const classes = useEstilos();
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(() => new Set());

  if (carga.estado === 'carregando') return null;

  const titulo = (
    <Typography variant="subtitle1" component="h3">
      Investigações anteriores
    </Typography>
  );

  if (carga.estado === 'falhou') {
    if (carga.falha.tipo !== 'mensagem') return null;
    return (
      <section className={classes.secao} aria-label="Investigações anteriores">
        {titulo}
        <p className={classes.erro}>{carga.falha.texto}</p>
      </section>
    );
  }

  const alternar = (id: string) => {
    const estavaAberto = abertos.has(id);
    setAbertos(atual => {
      const proximo = new Set(atual);
      if (estavaAberto) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
    if (!estavaAberto) aoAbrir(id);
  };

  const agora = new Date();
  return (
    <section className={classes.secao} aria-label="Investigações anteriores">
      {titulo}
      {carga.dados.length === 0 && (
        <p className={classes.subtitulo}>
          Nenhuma investigação neste serviço ainda.
        </p>
      )}
      {carga.dados.length > 0 && (
        <ul className={classes.lista}>
          {carga.dados.map(item => {
            const aberto = abertos.has(item.id);
            const painel = `historico-${item.id}`;
            return (
              <li key={item.id} className={classes.itemHistorico}>
                <button
                  type="button"
                  className={classes.botaoHistorico}
                  aria-expanded={aberto}
                  aria-controls={painel}
                  onClick={() => alternar(item.id)}
                >
                  <span>{item.titulo}</span>
                  <span className={classes.metaHistorico}>
                    <time dateTime={item.criadoEm}>
                      {dataCurta(item.criadoEm, agora)}
                    </time>{' '}
                    · {rotuloSessao(item.status)}
                    {item.custoUsd !== null ? ` · ${dolar(item.custoUsd)}` : ''}
                  </span>
                </button>
                <div id={painel} hidden={!aberto}>
                  {aberto && <DetalheDoItem carga={detalhe(item.id)} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function textoDaFalha(falha: Falha): string {
  if (falha.tipo === 'mensagem') return falha.texto;
  if (falha.tipo === 'ausente') return 'Esta investigação não existe mais.';
  return MENSAGEM_NAO_CONFIGURADO;
}

// The proposal of one finished investigation. Its cause keeps the line breaks the
// agent wrote.
function DetalheDoItem({
  carga,
}: {
  carga: Carga<DetalheHistorico> | undefined;
}) {
  const classes = useEstilos();

  if (carga === undefined || carga.estado === 'carregando') {
    return (
      <p className={classes.subtitulo} role="status">
        Carregando a investigação…
      </p>
    );
  }
  if (carga.estado === 'falhou') {
    return (
      <p className={classes.erro} role="alert">
        {textoDaFalha(carga.falha)}
      </p>
    );
  }

  const { proposta } = carga.dados;
  if (proposta === null) {
    return (
      <p className={classes.subtitulo}>
        Esta investigação não chegou a propor uma correção.
      </p>
    );
  }
  return (
    <div className={classes.detalheHistorico}>
      <p className={classes.texto}>
        <strong>{proposta.titulo}</strong>
      </p>
      <p className={classes.subtitulo}>Tentativa {proposta.tentativa}</p>
      <p className={classes.causa}>{proposta.causa}</p>
      <ul className={classes.lista}>
        {proposta.arquivos.map(caminho => (
          <li key={caminho} className={classes.arquivo}>
            {caminho}
          </li>
        ))}
      </ul>
      {proposta.mr === null ? (
        <p className={classes.subtitulo}>
          Nenhum MR registrado para esta proposta.
        </p>
      ) : (
        <p className={classes.texto}>
          <a href={proposta.mr.url} target="_blank" rel="noopener noreferrer">
            MR !{proposta.mr.iid}
          </a>
          {` · pipeline ${rotuloPipeline(proposta.mr.statusPipeline)}`}
        </p>
      )}
    </div>
  );
}
