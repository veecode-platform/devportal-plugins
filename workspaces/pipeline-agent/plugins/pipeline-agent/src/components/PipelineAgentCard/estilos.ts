import { fade, makeStyles, type Theme } from '@material-ui/core/styles';

// Colours come only from the theme, so the card follows light and dark mode.
export const useEstilos = makeStyles((tema: Theme) => ({
  corpo: {
    display: 'flex',
    flexDirection: 'column',
    gap: tema.spacing(2),
  },
  secao: {
    display: 'flex',
    flexDirection: 'column',
    gap: tema.spacing(1.5),
    marginBottom: tema.spacing(3),
  },
  subtitulo: {
    color: tema.palette.text.secondary,
    margin: 0,
  },
  texto: {
    margin: 0,
  },
  erro: {
    color: tema.palette.error.main,
    margin: 0,
  },
  sucesso: {
    color: tema.palette.success.main,
    margin: 0,
  },
  faixa: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: tema.spacing(2),
    padding: tema.spacing(2),
    borderRadius: tema.shape.borderRadius,
    border: `1px solid ${tema.palette.error.main}`,
    backgroundColor: fade(tema.palette.error.main, 0.08),
  },
  acoes: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tema.spacing(1),
  },
  campo: {
    display: 'flex',
    flexDirection: 'column',
    gap: tema.spacing(1),
  },
  lista: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tema.spacing(1),
  },
  comando: {
    marginTop: tema.spacing(1),
  },
  codigo: {
    margin: 0,
    padding: tema.spacing(1.5),
    overflowX: 'auto',
    whiteSpace: 'pre',
    fontSize: 12,
    borderRadius: tema.shape.borderRadius,
    border: `1px solid ${tema.palette.divider}`,
    backgroundColor: tema.palette.background.default,
  },
  diffLinha: {
    display: 'block',
  },
  diffMais: {
    color: tema.palette.success.main,
    backgroundColor: fade(tema.palette.success.main, 0.12),
  },
  diffMenos: {
    color: tema.palette.error.main,
    backgroundColor: fade(tema.palette.error.main, 0.12),
  },
  botaoPerigo: {
    color: tema.palette.error.main,
    borderColor: tema.palette.error.main,
  },
  diagnostico: {
    padding: tema.spacing(2),
    borderRadius: tema.shape.borderRadius,
    border: `1px solid ${tema.palette.divider}`,
    display: 'flex',
    flexDirection: 'column',
    gap: tema.spacing(1.5),
  },
  arquivo: {
    fontFamily: 'monospace',
    fontSize: 13,
    marginBottom: tema.spacing(0.5),
  },
  rodape: {
    color: tema.palette.text.secondary,
    fontSize: 13,
    margin: 0,
  },
  itemHistorico: {
    display: 'flex',
    flexDirection: 'column',
    gap: tema.spacing(0.25),
  },
  metaHistorico: {
    color: tema.palette.text.secondary,
    fontSize: 13,
  },
}));
