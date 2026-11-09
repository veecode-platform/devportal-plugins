import { ConfigReader } from '@backstage/config';
import { readAppPublicationConfig } from './config';

const read = (appPublication: Record<string, unknown>) =>
  readAppPublicationConfig(new ConfigReader({ appPublication } as never));

describe('readAppPublicationConfig', () => {
  it('applies the defaults once the project path prefix is given', () => {
    const settings = read({ projectPathPrefix: 'example-org' });

    expect(settings).toEqual({
      projectPathPrefix: 'example-org',
      deployJobName: 'deploy',
      deployResultArtifact: 'smoke-result.json',
      contractJobName: 'contract',
      contractResultArtifact: 'contract-result.json',
      conflictMarkersJobName: 'conflict-markers',
      renderJobName: 'render',
      maxWaitSeconds: 20,
      pollIntervalSeconds: 5,
      maxArtifactBytes: 65536,
      failedJobLogLines: 40,
      addressLinkType: 'app-address',
      dashboardAnnotation: 'grafana/overview-dashboard',
      environments: ['dev'],
    });
  });

  it('refuses a missing block, which has no project path prefix', () => {
    expect(() => readAppPublicationConfig(new ConfigReader({}))).toThrow(
      /projectPathPrefix/,
    );
  });

  it.each([
    ['a missing prefix', {}],
    ['a prefix with a leading slash', { projectPathPrefix: '/example-org' }],
    ['a prefix with a trailing slash', { projectPathPrefix: 'example-org/' }],
    [
      'a prefix with a .. segment',
      { projectPathPrefix: 'example-org/../other' },
    ],
    [
      'a prefix with a character outside the path set',
      { projectPathPrefix: 'example org' },
    ],
    [
      'maxWaitSeconds 0',
      { projectPathPrefix: 'example-org', maxWaitSeconds: 0 },
    ],
    [
      'maxWaitSeconds 271',
      { projectPathPrefix: 'example-org', maxWaitSeconds: 271 },
    ],
    [
      'a poll interval not below the wait',
      {
        projectPathPrefix: 'example-org',
        maxWaitSeconds: 10,
        pollIntervalSeconds: 10,
      },
    ],
    ['an unknown key', { projectPathPrefix: 'example-org', unknownKey: true }],
    [
      'a job name with a space',
      { projectPathPrefix: 'example-org', deployJobName: 'deploy job' },
    ],
    [
      'a render job name with a space',
      { projectPathPrefix: 'example-org', renderJobName: 'render job' },
    ],
    [
      'a log of 0 lines',
      { projectPathPrefix: 'example-org', failedJobLogLines: 0 },
    ],
    [
      'an artifact cap below 1024 bytes',
      { projectPathPrefix: 'example-org', maxArtifactBytes: 512 },
    ],
  ])('refuses %s', (_label, value) => {
    expect(() => read(value)).toThrow();
  });

  it('accepts the longest wait the portal may use', () => {
    expect(
      read({ projectPathPrefix: 'example-org', maxWaitSeconds: 270 })
        .maxWaitSeconds,
    ).toBe(270);
  });
});
