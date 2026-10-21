import type { Passo } from '../../state/visao';
import { useEstilos } from './estilos';

export function Passos({ passos }: { passos: Passo[] }) {
  const classes = useEstilos();
  return (
    <ul className={classes.lista}>
      {passos.map(passo => (
        <li key={`${passo.tipo}-${passo.id}`}>
          {passo.tipo === 'passo' ? (
            <p className={classes.texto}>{passo.texto}</p>
          ) : (
            <>
              <p className={classes.texto}>{passo.resumo}</p>
              <details className={classes.comando}>
                <summary>Ver comando e saída</summary>
                <pre className={classes.codigo}>{passo.comando}</pre>
                {passo.saida !== null && (
                  <pre className={classes.codigo}>{passo.saida}</pre>
                )}
              </details>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
