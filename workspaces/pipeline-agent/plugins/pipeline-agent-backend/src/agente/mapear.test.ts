import type { SdkEvent } from './types';
import { mapSessionEvent, resumoComando } from './mapear';

describe('mapSessionEvent', () => {
  it('turns a bash tool use into a command step with a short summary', () => {
    const evento = {
      id: 'toolu_1',
      type: 'agent.tool_use',
      name: 'bash',
      input: { command: 'mvn -B test -Dtest=DescontoServiceTest' },
      processed_at: 'p',
    } as unknown as SdkEvent;
    expect(mapSessionEvent(evento)).toEqual([
      {
        tipo: 'ui',
        evento: {
          tipo: 'comando',
          id: 'toolu_1',
          resumo: 'Rodou os testes com Maven',
          comando: 'mvn -B test -Dtest=DescontoServiceTest',
        },
      },
    ]);
  });

  it('asks for an answer on a custom tool use and on an idle session with requires_action', () => {
    const ferramenta = {
      id: 'toolu_mr',
      type: 'agent.custom_tool_use',
      name: 'abrir_mr',
      input: {},
      processed_at: 'p',
    } as unknown as SdkEvent;
    expect(mapSessionEvent(ferramenta)).toEqual([
      {
        tipo: 'pedido_ferramenta',
        toolUseId: 'toolu_mr',
        nome: 'abrir_mr',
        entrada: {},
      },
    ]);
    const ocioso = {
      id: 'evt_1',
      type: 'session.status_idle',
      stop_reason: { type: 'requires_action', event_ids: ['toolu_mr'] },
      processed_at: 'p',
    } as unknown as SdkEvent;
    expect(mapSessionEvent(ocioso)).toEqual([
      { tipo: 'ocioso', motivo: 'requires_action', eventIds: ['toolu_mr'] },
    ]);
  });

  it('shows an empty agent message as nothing', () => {
    const vazio = {
      id: 'evt_2',
      type: 'agent.message',
      content: [{ type: 'text', text: '   ' }],
      processed_at: 'p',
    } as unknown as SdkEvent;
    expect(mapSessionEvent(vazio)).toEqual([]);
  });
});

describe('resumoComando', () => {
  it('summarizes each command by what it did', () => {
    expect(resumoComando('mvn -B test -Dtest=DescontoServiceTest')).toBe(
      'Rodou os testes com Maven',
    );
    expect(resumoComando('cat /mnt/session/uploads/pipeline/trace.log')).toBe(
      'Leu o log do job',
    );
    expect(
      resumoComando('tail -n 40 /mnt/session/uploads/pipeline/trace.log'),
    ).toBe('Leu o log do job');
    expect(
      resumoComando('grep -n ERROR /mnt/session/uploads/pipeline/trace.log'),
    ).toBe('Leu o log do job');
    expect(
      resumoComando("sed -n '1,5p' /mnt/session/uploads/pipeline/trace.log"),
    ).toBe('Leu o log do job');
    expect(
      resumoComando('head -n 5 /mnt/session/uploads/pipeline/trace.log'),
    ).toBe('Leu o log do job');
    expect(resumoComando('cat /mnt/session/uploads/pipeline/commit.diff')).toBe(
      'Leu o diff do commit',
    );
    expect(
      resumoComando(
        'tar -xzf /mnt/session/uploads/pipeline/repo.tar.gz -C /tmp/repo --strip-components=1',
      ),
    ).toBe('Extraiu o código do commit');
    expect(resumoComando('ls -R /mnt/session/uploads')).toBe(
      'Procurou os arquivos do pipeline',
    );
    expect(resumoComando("find /mnt/session/uploads -name '*.log'")).toBe(
      'Procurou os arquivos do pipeline',
    );
    expect(resumoComando('git show 6b2d2c79 -- src/Main.java')).toBe(
      'Comparou a mudança com o código original',
    );
  });

  it('counts a tar extraction before the git init that follows it', () => {
    expect(
      resumoComando(
        'mkdir -p /tmp/repo && tar -xzf /mnt/session/uploads/pipeline/repo.tar.gz -C /tmp/repo && cd /tmp/repo && git init -q',
      ),
    ).toBe('Extraiu o código do commit');
  });

  it('counts a command as tar only when tar is the command word', () => {
    expect(resumoComando('ls /mnt/session/uploads/pipeline/repo.tar.gz')).toBe(
      'Procurou os arquivos do pipeline',
    );
  });

  it('keeps the first line of any other command', () => {
    expect(resumoComando('cat README.md')).toBe('cat README.md');
  });

  it('cuts a long unknown command to 80 characters', () => {
    const longo = 'x'.repeat(120);
    expect(resumoComando(longo)).toHaveLength(80);
    expect(resumoComando(longo).endsWith('...')).toBe(true);
  });
});

describe('mapSessionEvent for the file read tool', () => {
  it('names the file relative to /tmp/repo', () => {
    const leitura = {
      id: 'toolu_read',
      type: 'agent.tool_use',
      name: 'read',
      input: {
        file_path:
          '/tmp/repo/src/main/java/br/com/exemplo/pedidos/DescontoService.java',
      },
      processed_at: 'p',
    } as unknown as SdkEvent;
    expect(mapSessionEvent(leitura)).toEqual([
      {
        tipo: 'ui',
        evento: {
          tipo: 'comando',
          id: 'toolu_read',
          resumo:
            'Leu src/main/java/br/com/exemplo/pedidos/DescontoService.java',
          comando: 'src/main/java/br/com/exemplo/pedidos/DescontoService.java',
        },
      },
    ]);
  });

  it('keeps a path outside /tmp/repo as it is', () => {
    const leitura = {
      id: 'toolu_view',
      type: 'agent.tool_use',
      name: 'view',
      input: { file_path: '/mnt/session/uploads/pipeline/trace.log' },
      processed_at: 'p',
    } as unknown as SdkEvent;
    expect(mapSessionEvent(leitura)).toEqual([
      {
        tipo: 'ui',
        evento: {
          tipo: 'comando',
          id: 'toolu_view',
          resumo: 'Leu /mnt/session/uploads/pipeline/trace.log',
          comando: '/mnt/session/uploads/pipeline/trace.log',
        },
      },
    ]);
  });

  it('falls back to a plain step when the read tool has no path', () => {
    const semCaminho = {
      id: 'toolu_read_vazio',
      type: 'agent.tool_use',
      name: 'read',
      input: {},
      processed_at: 'p',
    } as unknown as SdkEvent;
    expect(mapSessionEvent(semCaminho)).toEqual([
      {
        tipo: 'ui',
        evento: {
          tipo: 'passo',
          id: 'toolu_read_vazio',
          texto: 'Usou a ferramenta read',
        },
      },
    ]);
  });
});
