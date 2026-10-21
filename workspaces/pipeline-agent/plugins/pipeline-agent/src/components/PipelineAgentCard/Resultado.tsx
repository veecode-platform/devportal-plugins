import Link from '@material-ui/core/Link';
import type { Visao } from '../../state/visao';
import { rotuloPipeline } from '../../state/rotulos';
import { useEstilos } from './estilos';

export function Resultado({ visao }: { visao: Visao }) {
  const classes = useEstilos();
  const { recusa, mr, pipeline, erro, encerrado } = visao;
  const emAndamento =
    pipeline !== null &&
    pipeline.status !== 'success' &&
    pipeline.status !== 'failed';

  return (
    <>
      {recusa !== null && (
        <p className={classes.texto}>Proposta recusada. Motivo: {recusa}</p>
      )}
      {mr !== null && (
        <p className={classes.texto}>
          MR !{mr.iid} aberto:{' '}
          <Link href={mr.url} target="_blank" rel="noreferrer">
            {mr.titulo}
          </Link>
        </p>
      )}
      {pipeline !== null && emAndamento && (
        <p className={classes.texto}>
          Pipeline do MR: {rotuloPipeline(pipeline.status)}…
        </p>
      )}
      {pipeline?.status === 'success' && (
        <p className={classes.sucesso}>
          Pipeline do MR passou: {pipeline.jobs.join(', ')}
        </p>
      )}
      {pipeline?.status === 'failed' && (
        <p className={classes.erro}>
          Pipeline do MR falhou
          {pipeline.jobFalho ? ` no job ${pipeline.jobFalho}` : ''}.
        </p>
      )}
      {erro !== null && <p className={classes.erro}>{erro}</p>}
      {encerrado !== null && (
        <p className={classes.subtitulo}>Sessão encerrada: {encerrado}.</p>
      )}
    </>
  );
}
