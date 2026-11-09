// Labels the card shows for session and GitLab statuses. Unknown values fall
// back to a generic pt-BR label, never to the raw English string.

const ROTULOS_SESSAO = new Map<string, string>([
  ['idle', 'concluída'],
  ['running', 'em andamento'],
  ['rescheduling', 'reagendando'],
  ['terminated', 'encerrada'],
]);

const ROTULOS_PIPELINE = new Map<string, string>([
  ['created', 'criado'],
  ['waiting_for_resource', 'esperando um runner'],
  ['preparing', 'preparando o runner'],
  ['pending', 'na fila'],
  ['running', 'em andamento'],
  ['success', 'passou'],
  ['failed', 'falhou'],
  ['canceled', 'cancelado'],
  ['skipped', 'ignorado'],
  ['manual', 'manual'],
  ['scheduled', 'agendado'],
]);

export function rotuloSessao(status: string): string {
  return ROTULOS_SESSAO.get(status) ?? 'estado desconhecido';
}

export function rotuloPipeline(status: string): string {
  return ROTULOS_PIPELINE.get(status) ?? 'estado desconhecido';
}
