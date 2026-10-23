import { Entity } from '@backstage/catalog-model';
import { isPipelineAgentAvailable } from './conditions';

function componentWith(annotations?: Record<string, string>): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: 'pedidos-api', annotations },
    spec: { type: 'service' },
  };
}

const ENABLED = { 'veecode.io/pipeline-agent': 'enabled' };
const SLUG = { 'gitlab.com/project-slug': 'veecode-demos/pedidos-api' };

describe('isPipelineAgentAvailable', () => {
  it('is true when the entity opts in and names a GitLab project', () => {
    expect(
      isPipelineAgentAvailable(componentWith({ ...ENABLED, ...SLUG })),
    ).toBe(true);
  });

  it('is false for an entity that only has the GitLab project annotation', () => {
    expect(isPipelineAgentAvailable(componentWith(SLUG))).toBe(false);
  });

  it('is false when the enabled annotation has any value other than enabled', () => {
    expect(
      isPipelineAgentAvailable(
        componentWith({ 'veecode.io/pipeline-agent': 'disabled', ...SLUG }),
      ),
    ).toBe(false);
  });

  it('is false for an entity that opts in without a GitLab project', () => {
    expect(isPipelineAgentAvailable(componentWith(ENABLED))).toBe(false);
  });

  it('is false when there are no annotations at all', () => {
    expect(isPipelineAgentAvailable(componentWith(undefined))).toBe(false);
  });
});
