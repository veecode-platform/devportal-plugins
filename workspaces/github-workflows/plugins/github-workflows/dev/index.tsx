import { createDevApp } from '@backstage/dev-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import { githubWorkflowsApiRef } from '@veecode-platform/github-workflows-common';
import { githubWorkflowsPlugin, GithubWorkflowsContent } from '../src/plugin';
import { MockGithubWorkflowsClient } from '../src/api/MockGithubWorkflowsClient';

const mockEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'mock-service',
    annotations: {
      'github.com/project-slug': 'mock-org/mock-repo',
    },
  },
  spec: {
    type: 'service',
    lifecycle: 'production',
    owner: 'team-a',
  },
};

const mockClient = new MockGithubWorkflowsClient();

createDevApp()
  .registerPlugin(githubWorkflowsPlugin)
  .addPage({
    element: (
      <TestApiProvider apis={[[githubWorkflowsApiRef, mockClient]]}>
        <EntityProvider entity={mockEntity}>
          <GithubWorkflowsContent />
        </EntityProvider>
      </TestApiProvider>
    ),
    title: 'Root Page',
    path: '/github-workflows',
  })
  .render();
