import Link from '@material-ui/core/Link';
import type { Visao } from '../../state/visao';
import { listaComE } from '../../state/formato';
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
        <p className={classes.texto}>
          {`Você recusou a proposta. Motivo: ${recusa}`}
        </p>
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
          O pipeline do MR passou
          {pipeline.jobs.length > 0 && ` (${listaComE(pipeline.jobs)})`}.
        </p>
      )}
      {pipeline?.status === 'failed' && (
        <p className={classes.erro}>
          O pipeline do MR falhou
          {pipeline.jobFalho && ` no job ${pipeline.jobFalho}`}.
        </p>
      )}
      {erro !== null && <p className={classes.erro}>{erro}</p>}
      {encerrado !== null && (
        <p className={classes.subtitulo}>
          {`Investigação encerrada: ${encerrado}.`}
        </p>
      )}
    </>
  );
}
