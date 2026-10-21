import type { UiEvent } from '@veecode-platform/backstage-plugin-pipeline-agent-common';
import type { SdkEvent } from './types';

// Translates one Managed Agents event into signals for the orchestrator: what to
// show on screen, and what needs an answer (a custom tool or the end of a turn).

export type Sinal =
  | { tipo: 'ui'; evento: UiEvent }
  | {
      tipo: 'pedido_ferramenta';
      toolUseId: string;
      nome: string;
      entrada: unknown;
    }
  | {
      tipo: 'ocioso';
      motivo: 'end_turn' | 'requires_action' | 'outro';
      eventIds: string[];
    }
  | { tipo: 'rodando' }
  | { tipo: 'terminou' };

function textoDeEntrada(entrada: unknown, chave: string): string {
  if (typeof entrada !== 'object' || entrada === null) return '';
  const valor = (entrada as Record<string, unknown>)[chave];
  return typeof valor === 'string' ? valor : '';
}

// A command word counts only at the start of a command, so repo.tar.gz is not tar.
const palavraDeComando = (nome: string): RegExp =>
  new RegExp(`(^|[\\s;&|(])${nome}(\\s|$)`);
const MVN = palavraDeComando('mvn');
const TAR = palavraDeComando('tar');
const GIT = palavraDeComando('git');
const LEITURA_DO_LOG = /\b(cat|head|tail|grep|sed)\b[^\n|;&]*\btrace\.log\b/;
const LEITURA_DO_DIFF = /\b(cat|head|tail|grep|sed)\b[^\n|;&]*\bcommit\.diff\b/;
const LISTAGEM_DOS_UPLOADS = /\b(ls|find)\b[^\n|;&]*\/mnt\/session\/uploads\b/;

// One short line for the step. The raw output stays in a collapsed block. The
// order matters: `tar -xzf ... && git init` is an extraction, not a git step.
export function resumoComando(comando: string): string {
  const c = comando.trim();
  if (MVN.test(c)) return 'Rodou os testes com Maven';
  if (LEITURA_DO_LOG.test(c)) return 'Leu o log do job';
  if (LEITURA_DO_DIFF.test(c)) return 'Leu o diff do commit';
  if (TAR.test(c)) return 'Extraiu o código do commit';
  if (LISTAGEM_DOS_UPLOADS.test(c)) return 'Procurou os arquivos do pipeline';
  if (GIT.test(c)) return 'Comparou a mudança com o código original';
  const primeira = c.split('\n')[0] ?? '';
  return primeira.length > 80 ? `${primeira.slice(0, 77)}...` : primeira;
}

// The file read tool's path, without the /tmp/repo/ prefix when the file is in the repo.
function caminhoLido(nome: string, entrada: unknown): string | null {
  if (nome !== 'read' && nome !== 'view') return null;
  const caminho = textoDeEntrada(entrada, 'file_path');
  if (!caminho) return null;
  return caminho.startsWith('/tmp/repo/')
    ? caminho.slice('/tmp/repo/'.length)
    : caminho;
}

export function mapSessionEvent(evento: SdkEvent): Sinal[] {
  switch (evento.type) {
    case 'agent.message': {
      const texto = evento.content
        .map(bloco => bloco.text)
        .join('')
        .trim();
      return texto
        ? [{ tipo: 'ui', evento: { tipo: 'passo', id: evento.id, texto } }]
        : [];
    }
    case 'agent.tool_use': {
      if (evento.name === 'bash') {
        const comando = textoDeEntrada(evento.input, 'command');
        return [
          {
            tipo: 'ui',
            evento: {
              tipo: 'comando',
              id: evento.id,
              resumo: resumoComando(comando),
              comando,
            },
          },
        ];
      }
      const caminho = caminhoLido(evento.name, evento.input);
      if (caminho !== null) {
        return [
          {
            tipo: 'ui',
            evento: {
              tipo: 'comando',
              id: evento.id,
              resumo: `Leu ${caminho}`,
              comando: caminho,
            },
          },
        ];
      }
      return [
        {
          tipo: 'ui',
          evento: {
            tipo: 'passo',
            id: evento.id,
            texto: `Usou a ferramenta ${evento.name}`,
          },
        },
      ];
    }
    case 'agent.tool_result': {
      const saida = (evento.content ?? [])
        .map(bloco => (bloco.type === 'text' ? bloco.text : ''))
        .filter(t => t.length > 0)
        .join('\n');
      return [
        {
          tipo: 'ui',
          evento: { tipo: 'comando_saida', id: evento.tool_use_id, saida },
        },
      ];
    }
    case 'agent.custom_tool_use':
      return [
        {
          tipo: 'pedido_ferramenta',
          toolUseId: evento.id,
          nome: evento.name,
          entrada: evento.input,
        },
      ];
    case 'session.status_idle': {
      const parada = evento.stop_reason;
      if (parada.type === 'end_turn')
        return [{ tipo: 'ocioso', motivo: 'end_turn', eventIds: [] }];
      if (parada.type === 'requires_action') {
        return [
          {
            tipo: 'ocioso',
            motivo: 'requires_action',
            eventIds: parada.event_ids,
          },
        ];
      }
      return [{ tipo: 'ocioso', motivo: 'outro', eventIds: [] }];
    }
    case 'session.status_running':
      return [{ tipo: 'rodando' }];
    case 'session.status_terminated':
      return [{ tipo: 'terminou' }];
    case 'session.error':
      return [
        {
          tipo: 'ui',
          evento: { tipo: 'erro', mensagem: evento.error.message },
        },
      ];
    default:
      return [];
  }
}
