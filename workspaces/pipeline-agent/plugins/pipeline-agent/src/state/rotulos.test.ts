import { rotuloPipeline, rotuloSessao } from './rotulos';

describe('rotuloSessao', () => {
  it('shows a finished session as concluída, not parada', () => {
    expect(rotuloSessao('idle')).toBe('concluída');
  });

  it('translates the live session states', () => {
    expect(rotuloSessao('running')).toBe('em andamento');
    expect(rotuloSessao('rescheduling')).toBe('reagendando');
    expect(rotuloSessao('terminated')).toBe('encerrada');
  });

  it('falls back to a pt-BR label for an unknown state', () => {
    expect(rotuloSessao('paused')).toBe('estado desconhecido');
  });
});

describe('rotuloPipeline', () => {
  it('translates the GitLab statuses shown mid-flow', () => {
    expect(rotuloPipeline('running')).toBe('em andamento');
    expect(rotuloPipeline('success')).toBe('passou');
    expect(rotuloPipeline('failed')).toBe('falhou');
  });

  it('never returns the raw English status for a known value', () => {
    expect(rotuloPipeline('canceled')).toBe('cancelado');
    expect(rotuloPipeline('pending')).toBe('na fila (pending)');
    expect(rotuloPipeline('waiting_for_resource')).toBe(
      'esperando um runner (waiting_for_resource)',
    );
  });

  it('falls back to a generic label for an unknown status, including an object key', () => {
    expect(rotuloPipeline('mystery')).toBe('estado desconhecido');
    expect(rotuloPipeline('constructor')).toBe('estado desconhecido');
  });
});
