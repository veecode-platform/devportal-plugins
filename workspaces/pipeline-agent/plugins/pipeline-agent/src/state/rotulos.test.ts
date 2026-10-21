import { dolar, duracao } from './formato';
import { rotuloPipeline, rotuloSessao } from './rotulos';

describe('rotuloSessao', () => {
  it('shows a finished session as concluída, not parada', () => {
    expect(rotuloSessao('idle')).toBe('Concluída');
  });

  it('translates the live session states', () => {
    expect(rotuloSessao('running')).toBe('Em execução');
    expect(rotuloSessao('rescheduling')).toBe('Reagendando');
    expect(rotuloSessao('terminated')).toBe('Encerrada');
  });

  it('falls back to a pt-BR label for an unknown state', () => {
    expect(rotuloSessao('paused')).toBe('Estado desconhecido');
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
    expect(rotuloPipeline('pending')).toBe('pendente');
  });

  it('falls back to a generic label for an unknown status, including an object key', () => {
    expect(rotuloPipeline('mystery')).toBe('estado desconhecido');
    expect(rotuloPipeline('constructor')).toBe('estado desconhecido');
  });
});

describe('formato', () => {
  it('writes the time to green as minutes and seconds', () => {
    expect(duracao(11)).toBe('0m 11s');
    expect(duracao(125.4)).toBe('2m 5s');
  });

  it('writes dollars with a decimal comma', () => {
    expect(dolar(0.04)).toBe('US$ 0,04');
    expect(dolar(1.5)).toBe('US$ 1,50');
  });
});
