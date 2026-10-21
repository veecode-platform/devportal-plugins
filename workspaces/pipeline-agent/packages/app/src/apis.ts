import {
  ScmIntegrationsApi,
  scmIntegrationsApiRef,
  ScmAuth,
} from '@backstage/integration-react';
import {
  AnyApiFactory,
  configApiRef,
  createApiFactory,
} from '@backstage/core-plugin-api';
import { pipelineAgentApiRef } from '@veecode-platform/backstage-plugin-pipeline-agent';
import { PipelineAgentFake } from './dev/PipelineAgentFake';

export const apis: AnyApiFactory[] = [
  createApiFactory({
    api: scmIntegrationsApiRef,
    deps: { configApi: configApiRef },
    factory: ({ configApi }) => ScmIntegrationsApi.fromConfig(configApi),
  }),
  ScmAuth.createDefaultApiFactory(),
  // Dev shell only: the backend is built elsewhere, so the card talks to a
  // scripted fake. App-level factories override the plugin's own client.
  createApiFactory({
    api: pipelineAgentApiRef,
    deps: {},
    factory: () => new PipelineAgentFake(),
  }),
];
