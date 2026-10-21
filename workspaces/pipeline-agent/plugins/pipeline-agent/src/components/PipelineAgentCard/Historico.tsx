import Typography from '@material-ui/core/Typography';
import type { ItemHistorico } from '@veecode-platform/backstage-plugin-pipeline-agent-common';
import { dolar } from '../../state/formato';
import { rotuloSessao } from '../../state/rotulos';
import { type Carga } from './carga';
import { useEstilos } from './estilos';

// A 404 or a 503 is not a history error: the card already says what is wrong,
// so the history block stays out of the way.
export function Historico({ carga }: { carga: Carga<ItemHistorico[]> }) {
  const classes = useEstilos();

  if (carga.estado === 'carregando') return null;

  const titulo = (
    <Typography variant="subtitle1" component="h3">
      Histórico
    </Typography>
  );

  if (carga.estado === 'falhou') {
    if (carga.falha.tipo !== 'mensagem') return null;
    return (
      <section className={classes.secao} aria-label="Histórico">
        {titulo}
        <p className={classes.erro}>{carga.falha.texto}</p>
      </section>
    );
  }

  return (
    <section className={classes.secao} aria-label="Histórico">
      {titulo}
      {carga.dados.length === 0 && (
        <p className={classes.subtitulo}>Nenhuma investigação ainda.</p>
      )}
      {carga.dados.length > 0 && (
        <ul className={classes.lista}>
          {carga.dados.map(item => (
            <li key={item.id} className={classes.itemHistorico}>
              <span>{item.titulo}</span>
              <span className={classes.metaHistorico}>
                <time dateTime={item.criadoEm}>
                  {new Date(item.criadoEm).toLocaleString('pt-BR')}
                </time>{' '}
                · {rotuloSessao(item.status)}
                {item.custoUsd !== null ? ` · ${dolar(item.custoUsd)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
