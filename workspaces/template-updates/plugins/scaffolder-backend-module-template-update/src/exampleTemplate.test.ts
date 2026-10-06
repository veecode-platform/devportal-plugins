import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

describe('Update from template example', () => {
  it('skips every render, merge, and publish step when the record is current', () => {
    const template = parse(
      readFileSync(
        resolve(
          __dirname,
          '../../../examples/update-from-template/template.yaml',
        ),
        'utf8',
      ),
    ) as {
      spec: {
        steps: Array<{ id: string; if?: string }>;
        output: { links: Array<{ if?: string }> };
      };
    };
    const steps = template.spec.steps;

    expect(steps.map(step => step.id)).toEqual([
      'readRecord',
      'renderOld',
      'renderNew',
      'fetchProject',
      'merge',
      'publishMr',
    ]);
    for (const step of steps.slice(1)) {
      expect(step.if).toBe('${{ steps.readRecord.output.upToDate === false }}');
    }
    expect(template.spec.output.links[0].if).toBe(
      "${{ steps.readRecord.output.upToDate === false && steps.publishMr.output.status !== 'none' }}",
    );
  });

  it('fetches and publishes against the project snapshot and checks the requested render version', () => {
    const template = parse(
      readFileSync(
        resolve(
          __dirname,
          '../../../examples/update-from-template/template.yaml',
        ),
        'utf8',
      ),
    ) as {
      spec: {
        steps: Array<{ id: string; input?: Record<string, string> }>;
      };
    };
    const steps = Object.fromEntries(
      template.spec.steps.map(step => [step.id, step]),
    );

    expect(steps.fetchProject?.input?.url).toBe(
      '${{ steps.readRecord.output.projectUrl }}',
    );
    expect(steps.merge?.input?.targetVersion).toBe(
      '${{ steps.readRecord.output.targetVersion }}',
    );
    expect(steps.publishMr?.input?.projectSha).toBe(
      '${{ steps.readRecord.output.projectSha }}',
    );
  });
});
