import { useState } from 'react';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import type { ArquivoDiff } from '@veecode-platform/backstage-plugin-pipeline-agent-common';
import type { Diagnostico } from '../../state/visao';
import { useEstilos } from './estilos';

// The backend's limit on diagnosis attempts.
const MAX_TENTATIVAS = 3;

type Estilos = ReturnType<typeof useEstilos>;

const classeDaLinha = (linha: string, classes: Estilos) => {
  if (linha.startsWith('+') && !linha.startsWith('+++')) {
    return `${classes.diffLinha} ${classes.diffMais}`;
  }
  if (linha.startsWith('-') && !linha.startsWith('---')) {
    return `${classes.diffLinha} ${classes.diffMenos}`;
  }
  return classes.diffLinha;
};

function Diff({ arquivo }: { arquivo: ArquivoDiff }) {
  const classes = useEstilos();
  return (
    <div>
      <p className={classes.arquivo}>
        {arquivo.caminho}
        {arquivo.novo ? ' (arquivo novo)' : ''}
      </p>
      <pre className={classes.codigo}>
        {arquivo.diff.split('\n').map((linha, i) => (
          <span key={i} className={classeDaLinha(linha, classes)}>
            {linha}
          </span>
        ))}
      </pre>
    </div>
  );
}

// The cause, the proposed change and the diff. Shared by the pending proposal
// and by the approved one that stays on screen after the MR opens.
function DetalheDiagnostico({ diagnostico }: { diagnostico: Diagnostico }) {
  const classes = useEstilos();
  return (
    <>
      <p className={classes.texto}>{diagnostico.causa}</p>
      <p className={classes.texto}>
        <strong>Correção proposta:</strong> {diagnostico.titulo}
      </p>
      {diagnostico.arquivos.map(arquivo => (
        <Diff key={arquivo.caminho} arquivo={arquivo} />
      ))}
    </>
  );
}

export function DiagnosticoAprovado({
  diagnostico,
}: {
  diagnostico: Diagnostico;
}) {
  return (
    <details>
      <summary>Ver o diagnóstico aprovado</summary>
      <DetalheDiagnostico diagnostico={diagnostico} />
    </details>
  );
}

type Modo = 'nenhum' | 'orientar' | 'recusar';

type PropsBloco = {
  diagnostico: Diagnostico;
  ocupado: boolean;
  onAprovar: () => void;
  onRecusar: (motivo: string) => void;
  onOrientar: (texto: string) => void;
};

export function BlocoDiagnostico({
  diagnostico,
  ocupado,
  onAprovar,
  onRecusar,
  onOrientar,
}: PropsBloco) {
  const classes = useEstilos();
  const [modo, setModo] = useState<Modo>('nenhum');
  const [texto, setTexto] = useState('');

  const alternar = (proximo: Exclude<Modo, 'nenhum'>) => {
    setModo(modo === proximo ? 'nenhum' : proximo);
    setTexto('');
  };

  const enviar = () => {
    if (modo === 'orientar') onOrientar(texto.trim());
    if (modo === 'recusar') onRecusar(texto.trim());
    setTexto('');
    setModo('nenhum');
  };

  return (
    <section className={classes.diagnostico} aria-label="Diagnóstico">
      <Typography variant="subtitle1" component="h3">
        {`Diagnóstico (tentativa ${diagnostico.tentativa} de ${MAX_TENTATIVAS})`}
      </Typography>
      <DetalheDiagnostico diagnostico={diagnostico} />
      <div className={classes.acoes}>
        <Button
          variant="contained"
          color="primary"
          disabled={ocupado}
          onClick={() => onAprovar()}
        >
          Aprovar e abrir MR
        </Button>
        <Button
          variant="outlined"
          disabled={ocupado}
          onClick={() => alternar('orientar')}
        >
          Orientar o agente
        </Button>
        <Button
          variant="outlined"
          className={classes.botaoPerigo}
          disabled={ocupado}
          onClick={() => alternar('recusar')}
        >
          Recusar
        </Button>
      </div>
      {modo !== 'nenhum' && (
        <div className={classes.campo}>
          <TextField
            id={`pipeline-agent-${modo}`}
            label={
              modo === 'orientar'
                ? 'O que o agente deve levar em conta?'
                : 'Por que você está recusando?'
            }
            multiline
            rows={2}
            variant="outlined"
            value={texto}
            disabled={ocupado}
            onChange={e => setTexto(e.target.value)}
          />
          <div className={classes.acoes}>
            <Button
              variant="outlined"
              disabled={ocupado || texto.trim() === ''}
              onClick={enviar}
            >
              {modo === 'orientar' ? 'Enviar orientação' : 'Recusar a proposta'}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
