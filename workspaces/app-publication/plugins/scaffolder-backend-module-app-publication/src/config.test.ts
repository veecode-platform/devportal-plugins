import { ConfigReader } from '@backstage/config';
import { readAppPublicationConfig } from './config';

const read = (appPublication: Record<string, unknown>) =>
  readAppPublicationConfig(new ConfigReader({ appPublication } as never));

describe('readAppPublicationConfig', () => {
  it('applies the defaults when the block is missing', () => {
    const settings = readAppPublicationConfig(new ConfigReader({}));

    expect(settings).toEqual({
      deployJobName: 'deploy',
      deployResultArtifact: 'smoke-result.json',
      contractJobName: 'contract',
      contractResultArtifact: 'contract-result.json',
      conflictMarkersJobName: 'conflict-markers',
      maxWaitSeconds: 20,
      pollIntervalSeconds: 5,
      maxArtifactBytes: 65536,
      failedJobLogLines: 40,
      addressLinkType: 'app-address',
      dashboardAnnotation: 'grafana/overview-dashboard',
    });
  });

  it.each([
    ['maxWaitSeconds 0', { maxWaitSeconds: 0 }],
    ['maxWaitSeconds 271', { maxWaitSeconds: 271 }],
    [
      'a poll interval not below the wait',
      { maxWaitSeconds: 10, pollIntervalSeconds: 10 },
    ],
    ['an unknown key', { unknownKey: true }],
    ['a job name with a space', { deployJobName: 'deploy job' }],
    ['a log of 0 lines', { failedJobLogLines: 0 }],
    ['an artifact cap below 1024 bytes', { maxArtifactBytes: 512 }],
  ])('refuses %s', (_label, value) => {
    expect(() => read(value)).toThrow();
  });

  it('accepts the longest wait the portal may use', () => {
    expect(read({ maxWaitSeconds: 270 }).maxWaitSeconds).toBe(270);
  });
});
