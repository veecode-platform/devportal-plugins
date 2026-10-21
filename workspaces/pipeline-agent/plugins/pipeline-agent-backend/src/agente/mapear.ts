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

// One short line for the step. The raw output stays in a collapsed block.
export function resumoComando(comando: string): string {
  const c = comando.trim();
  if (/\bmvn\b/.test(c)) return 'Rodou o teste Maven no sandbox';
  if (/\bcurl\b|\/api\/v4/.test(c)) return 'Consultou a API do GitLab';
  if (/\bgit\b/.test(c)) return 'Consultou o histórico do Git';
  if (/\b(cat|sed|grep|head|tail)\b/.test(c))
    return 'Leu um arquivo do repositório';
  const primeira = c.split('\n')[0] ?? '';
  return primeira.length > 80 ? `${primeira.slice(0, 77)}...` : primeira;
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
