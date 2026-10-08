import { AnyApiFactory, createApiFactory } from '@backstage/core-plugin-api';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { InMemoryCatalogClient } from '@backstage/catalog-client/testUtils';
import {
  catalogApiRef,
  defaultEntityPresentation,
  entityPresentationApiRef,
} from '@backstage/plugin-catalog-react';
import {
  ScaffolderApi,
  scaffolderApiRef,
} from '@backstage/plugin-scaffolder-react';
import { skillEntities, slowEntityName, templateEntity } from './fixtures';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class FixtureCatalogClient extends InMemoryCatalogClient {
  async getEntityByRef(
    entityRef: Parameters<InMemoryCatalogClient['getEntityByRef']>[0],
  ) {
    const ref =
      typeof entityRef === 'string' ? entityRef : stringifyEntityRef(entityRef);
    await delay(ref.endsWith(`/${slowEntityName}`) ? 2000 : 300);
    return super.getEntityByRef(entityRef);
  }
}

// The dev shell has no backend: the scaffolder API serves the example template
// and keeps the requests it receives where a browser test can read them.
class FixtureScaffolderApi {
  async getTemplateParameterSchema() {
    const { metadata, spec } = templateEntity;
    const parameters = spec?.parameters as Record<string, unknown>[];
    return {
      title: metadata.title ?? metadata.name,
      description: metadata.description,
      steps: parameters.map(schema => ({
        title:
          (schema.title as string) ?? 'Please enter the following information',
        description: schema.description as string | undefined,
        schema,
      })),
    };
  }

  async scaffold(request: unknown) {
    const requests = ((window as any).scaffolderRequests ??= []);
    requests.push(request);
    return { taskId: 'fixture-task' };
  }
}

export const apis: AnyApiFactory[] = [
  createApiFactory({
    api: catalogApiRef,
    deps: {},
    factory: () =>
      new FixtureCatalogClient({
        entities: [...skillEntities, templateEntity],
      }),
  }),
  createApiFactory({
    api: entityPresentationApiRef,
    deps: {},
    factory: () => ({
      forEntity: (entityOrRef, context) => {
        const snapshot = defaultEntityPresentation(entityOrRef, context);
        return { snapshot, promise: Promise.resolve(snapshot) };
      },
    }),
  }),
  createApiFactory({
    api: scaffolderApiRef,
    deps: {},
    factory: () => new FixtureScaffolderApi() as unknown as ScaffolderApi,
  }),
];
