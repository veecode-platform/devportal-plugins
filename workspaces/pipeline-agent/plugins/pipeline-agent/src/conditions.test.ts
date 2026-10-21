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

describe('isPipelineAgentAvailable', () => {
  it('is true when the entity names a GitLab project', () => {
    expect(
      isPipelineAgentAvailable(
        componentWith({ 'gitlab.com/project-slug': 'veecode-demos/pedidos-api' }),
      ),
    ).toBe(true);
  });

  it('is false when the project annotation is missing', () => {
    expect(isPipelineAgentAvailable(componentWith({}))).toBe(false);
    expect(isPipelineAgentAvailable(componentWith(undefined))).toBe(false);
  });
});
