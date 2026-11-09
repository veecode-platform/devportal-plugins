import type { Passo } from '../../state/visao';
import { useEstilos } from './estilos';
import { TextoDoAgente } from './TextoDoAgente';

export function Passos({ passos }: { passos: Passo[] }) {
  const classes = useEstilos();
  return (
    <ul className={classes.lista}>
      {passos.map(passo => (
        <li key={`${passo.tipo}-${passo.id}`}>
          {passo.tipo === 'passo' ? (
            <TextoDoAgente texto={passo.texto} />
          ) : (
            <>
              <TextoDoAgente texto={passo.resumo} />
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
