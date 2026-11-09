import { partirCodigo } from '../../state/formato';
import { useEstilos } from './estilos';

export function LinhaComCodigo({ texto }: { texto: string }) {
  const classes = useEstilos();
  return (
    <>
      {partirCodigo(texto).map((trecho, i) =>
        trecho.tipo === 'codigo' ? (
          <code key={i} className={classes.codigoEmLinha}>
            {trecho.valor}
          </code>
        ) : (
          trecho.valor
        ),
      )}
    </>
  );
}

// Text the agent wrote: one paragraph per line, with code between backticks.
export function TextoDoAgente({ texto }: { texto: string }) {
  const classes = useEstilos();
  return (
    <>
      {texto.split('\n').map((linha, i) => (
        <p key={i} className={classes.texto}>
          <LinhaComCodigo texto={linha} />
        </p>
      ))}
    </>
  );
}
