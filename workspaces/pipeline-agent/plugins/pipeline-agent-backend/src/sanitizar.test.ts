import { hostDe, ocultarHost, sanitizarTrace } from './sanitizar';

const HOST = 'gitlab.example.com';

const PREAMBULO = [
  '\x1b[0Ksection_start:1700000000:prepare_executor\r\x1b[0K\x1b[0;mPreparing the "docker" executor\x1b[0;m',
  'Using Docker executor with image maven:3.9-eclipse-temurin-21 ...',
  'Running with gitlab-runner 17.4.0 (abc123) on runner-1 (abc123)',
  'section_end:1700000001:prepare_executor\r\x1b[0K',
  '\x1b[0Ksection_start:1700000002:get_sources\r\x1b[0K\x1b[0;mGetting source from Git repository\x1b[0;m',
  'Fetching changes from https://gitlab.example.com/veecode-demos/pedidos-api.git',
  'section_end:1700000003:get_sources\r\x1b[0K',
  'section_start:1700000004:step_script\r\x1b[0K\x1b[0;mExecuting "step_script" stage of the job script',
].join('\n');

describe('sanitizarTrace', () => {
  it('drops the runner preamble and keeps the script echo line onward', () => {
    const trace = [
      PREAMBULO,
      '\x1b[32;1m$ mvn -B test\x1b[0;m',
      '[ERROR] Tests run: 7, Failures: 1',
    ].join('\n');
    const limpo = sanitizarTrace(trace, HOST);
    expect(limpo.split('\n')[0]).toBe('$ mvn -B test');
    expect(limpo).toContain('[ERROR] Tests run: 7, Failures: 1');
    expect(limpo).not.toContain('gitlab-runner');
    expect(limpo).not.toContain('Getting source');
    expect(limpo).not.toContain('Fetching changes');
  });

  it('keeps every line when the trace has no script echo', () => {
    const trace = 'linha um\nlinha dois';
    expect(sanitizarTrace(trace, HOST)).toBe('linha um\nlinha dois');
  });

  it('keeps the section titles and removes the markers and the escapes', () => {
    const trace = [
      '\x1b[0Ksection_start:1700000010:test_run[collapsed=true]\r\x1b[0K\x1b[0;mRodando testes',
      '\x1b[0;m\x1b[31mFAIL\x1b[0m',
      'section_end:1700000011:test_run\r\x1b[0K',
    ].join('\n');
    expect(sanitizarTrace(trace, HOST)).toBe('Rodando testes\nFAIL');
  });

  it('replaces the GitLab host everywhere, in any letter case, and leaves other text alone', () => {
    const trace = [
      '$ git clone https://gitlab.example.com/veecode-demos/pedidos-api.git',
      'Baixando de GITLAB.EXAMPLE.COM e de gitlab.example.com:8443',
      'gitlab-runner e gitlab.examplex.com ficam como estão',
    ].join('\n');
    const limpo = sanitizarTrace(trace, HOST);
    expect(limpo).not.toMatch(/gitlab\.example\.com/i);
    expect(limpo).toContain(
      'https://gitlab.local/veecode-demos/pedidos-api.git',
    );
    expect(limpo).toContain('gitlab.local:8443');
    expect(limpo).toContain(
      'gitlab-runner e gitlab.examplex.com ficam como estão',
    );
  });
});

describe('ocultarHost', () => {
  it('hides the host in a unified diff', () => {
    const diff = '+  // see https://gitlab.example.com/x/-/blob/main/y\n-  old';
    expect(ocultarHost(diff, HOST)).toBe(
      '+  // see https://gitlab.local/x/-/blob/main/y\n-  old',
    );
  });

  it('returns the text unchanged when there is no host to hide', () => {
    expect(ocultarHost('texto', '')).toBe('texto');
  });
});

describe('hostDe', () => {
  it('reads the hostname of the configured base URL, without port or path', () => {
    expect(hostDe('https://gitlab.example.com:8443/')).toBe(
      'gitlab.example.com',
    );
    expect(hostDe('https://gitlab.com')).toBe('gitlab.com');
  });
});
