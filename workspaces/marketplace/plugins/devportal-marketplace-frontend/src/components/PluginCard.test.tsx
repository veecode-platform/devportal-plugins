/*
 * Copyright The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { BrowserRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { QueryClientProvider } from '@tanstack/react-query';

import {
  ExtensionsPackage,
  ExtensionsPackageInstallStatus,
  ExtensionsPlugin,
  ExtensionsPluginInstallStatus,
} from '@red-hat-developer-hub/backstage-plugin-extensions-common';

import { PluginCard } from './PluginCard';
import { dynamicPluginsInfoApiRef, extensionsApiRef } from '../api';
import { queryClient } from '../queryclient';
import { rootRouteRef, pluginRouteRef } from '../routes';
import { Permission } from '../types';

// Mock the route refs
jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: jest.fn().mockImplementation(ref => {
    if (ref === rootRouteRef) {
      return () => '/extensions';
    }
    if (ref === pluginRouteRef) {
      return () => '/extensions/plugin';
    }
    return () => '/';
  }),
}));

const mockPlugin: ExtensionsPlugin = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Plugin',
  metadata: {
    name: 'test-plugin',
    namespace: 'default',
    title: 'Test Plugin',
    description: 'A test plugin for testing',
  },
  spec: {
    authors: [{ name: 'Test Author' }],
    categories: ['testing'],
  },
};

const argocdPlugin: ExtensionsPlugin = {
  ...mockPlugin,
  metadata: { ...mockPlugin.metadata, name: 'redhat-argocd' },
};

const noPendingChanges = {
  count: 0,
  pendingInstalls: [],
  pendingRemovals: [],
  failedInstalls: [],
};

const pluginPackage = (
  name: string,
  dynamicArtifact: string,
  installStatus?: ExtensionsPackageInstallStatus,
): ExtensionsPackage => ({
  apiVersion: 'extensions.backstage.io/v1alpha1',
  kind: 'Package',
  metadata: { name, namespace: 'default' },
  spec: { dynamicArtifact, installStatus },
});

const loadedPlugin = (name: string) => ({
  name,
  version: '1.0.0',
  role: 'frontend-plugin',
  platform: 'web',
});

const renderPluginCard = (
  plugin: ExtensionsPlugin,
  {
    pendingChanges = noPendingChanges,
    packages = [],
    loadedPlugins = [],
  }: {
    pendingChanges?: object;
    packages?: ExtensionsPackage[];
    loadedPlugins?: ReturnType<typeof loadedPlugin>[];
  } = {},
) => {
  const apis = [
    [
      dynamicPluginsInfoApiRef,
      { listLoadedPlugins: jest.fn().mockResolvedValue(loadedPlugins) },
    ],
    [discoveryApiRef, mockApis.discovery()],
    [
      fetchApiRef,
      {
        fetch: jest
          .fn()
          .mockResolvedValue({ ok: true, json: async () => pendingChanges }),
      },
    ],
    [
      extensionsApiRef,
      {
        getPluginConfigAuthorization: jest.fn().mockResolvedValue({
          read: Permission.ALLOW,
          write: Permission.ALLOW,
        }),
        getPluginPackages: jest.fn().mockResolvedValue(packages),
      },
    ],
  ] as const;

  return render(
    <TestApiProvider apis={apis}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <PluginCard plugin={plugin} />
        </BrowserRouter>
      </QueryClientProvider>
    </TestApiProvider>,
  );
};

const statusChip = (label: string) =>
  screen.getByText(label).closest('[class*="MuiChip-root"]');

describe('PluginCard', () => {
  beforeEach(() => {
    queryClient.clear();
    queryClient.setDefaultOptions({ queries: { retry: false } });
  });

  describe('Install Status Indicators', () => {
    it('should show "Installed" status for Installed plugin', () => {
      const pluginWithStatus = {
        ...mockPlugin,
        spec: {
          ...mockPlugin.spec,
          installStatus: ExtensionsPluginInstallStatus.Installed,
        },
      };

      renderPluginCard(pluginWithStatus);

      expect(statusChip('Installed')?.className).toContain(
        'MuiChip-colorSuccess',
      );
    });

    it('should show "Installed" status for UpdateAvailable plugin', () => {
      const pluginWithStatus = {
        ...mockPlugin,
        spec: {
          ...mockPlugin.spec,
          installStatus: ExtensionsPluginInstallStatus.UpdateAvailable,
        },
      };

      renderPluginCard(pluginWithStatus);

      expect(statusChip('Installed')?.className).toContain(
        'MuiChip-colorSuccess',
      );
    });

    it('should show "Disabled" status for Disabled plugin', () => {
      const pluginWithStatus = {
        ...mockPlugin,
        spec: {
          ...mockPlugin.spec,
          installStatus: ExtensionsPluginInstallStatus.Disabled,
        },
      };

      renderPluginCard(pluginWithStatus);

      expect(statusChip('Disabled')?.className).toContain('MuiChip-colorError');
    });

    it('should not show any status for NotInstalled plugin', () => {
      const pluginWithStatus = {
        ...mockPlugin,
        spec: {
          ...mockPlugin.spec,
          installStatus: ExtensionsPluginInstallStatus.NotInstalled,
        },
      };

      renderPluginCard(pluginWithStatus);

      expect(screen.queryByText('Installed')).not.toBeInTheDocument();
      expect(screen.queryByText('Disabled')).not.toBeInTheDocument();
    });

    it('should not show any status when installStatus is undefined', () => {
      renderPluginCard(mockPlugin);

      expect(screen.queryByText('Installed')).not.toBeInTheDocument();
      expect(screen.queryByText('Disabled')).not.toBeInTheDocument();
    });

    it('should show "Failed to load" and keep Uninstall for a failed install', async () => {
      const artifact = 'oci://quay.io/example/test-plugin:1.0.0!test-plugin';
      renderPluginCard(mockPlugin, {
        pendingChanges: { ...noPendingChanges, failedInstalls: [artifact] },
        packages: [pluginPackage('test-plugin', artifact)],
      });

      await screen.findByText('Failed to load');
      expect(statusChip('Failed to load')?.className).toContain(
        'MuiChip-colorError',
      );
      expect(
        await screen.findByRole('button', { name: 'Uninstall' }),
      ).toBeInTheDocument();
    });

    it('should show "Failed to load" for a selector-less digest ref of one of its packages', async () => {
      const image = 'oci://quay.io/example/backstage-community-plugin-argocd';
      renderPluginCard(argocdPlugin, {
        pendingChanges: {
          ...noPendingChanges,
          failedInstalls: [`${image}@sha256:${'a'.repeat(64)}`],
        },
        packages: [
          pluginPackage(
            'backstage-community-plugin-redhat-argocd',
            `${image}@sha256:${'b'.repeat(64)}`,
          ),
        ],
      });

      expect(await screen.findByText('Failed to load')).toBeInTheDocument();
    });

    it('should show "Failed to load" for a selector-less tag ref of one of its packages', async () => {
      const ref =
        'oci://quay.io/example/backstage-community-plugin-argocd:bs_1.52.0__0.1.0';
      renderPluginCard(argocdPlugin, {
        pendingChanges: { ...noPendingChanges, failedInstalls: [ref] },
        packages: [
          pluginPackage('backstage-community-plugin-redhat-argocd', ref),
        ],
      });

      expect(await screen.findByText('Failed to load')).toBeInTheDocument();
    });

    it('should not show "Failed to load" for a failed digest ref of another plugin', async () => {
      renderPluginCard(mockPlugin, {
        pendingChanges: {
          ...noPendingChanges,
          failedInstalls: [
            `oci://quay.io/example/test-plugin-email@sha256:${'c'.repeat(64)}`,
          ],
        },
        packages: [
          pluginPackage(
            'test-plugin',
            'oci://quay.io/example/test-plugin:1.0.0!test-plugin',
          ),
        ],
      });

      await expect(screen.findByText('Failed to load')).rejects.toThrow();
    });

    it('should not show "Failed to load" for a failed tag ref of another plugin', async () => {
      renderPluginCard(mockPlugin, {
        pendingChanges: {
          ...noPendingChanges,
          failedInstalls: [
            'oci://quay.io/example/test-plugin-email:bs_1.52.0__0.1.0',
          ],
        },
        packages: [
          pluginPackage(
            'test-plugin',
            'oci://quay.io/example/test-plugin:bs_1.52.0__0.1.0',
          ),
        ],
      });

      await expect(screen.findByText('Failed to load')).rejects.toThrow();
    });
  });

  describe('Failed install matching', () => {
    it.each([
      [
        'a selector ref whose tag changed',
        'oci://quay.io/example/test-plugin:1.0.0!test-plugin',
        'oci://quay.io/example/test-plugin:2.0.0!test-plugin',
      ],
      [
        'a selector-less ref whose tag changed',
        'oci://quay.io/example/test-plugin:1.0.0',
        'oci://quay.io/example/test-plugin:2.0.0',
      ],
      [
        'a tag ref that the catalog now pins by digest',
        'oci://quay.io/example/test-plugin:1.0.0',
        `oci://quay.io/example/test-plugin@sha256:${'d'.repeat(64)}`,
      ],
      [
        'a registry with a port whose tag changed',
        'oci://localhost:5000/example/test-plugin:1.0.0',
        'oci://localhost:5000/example/test-plugin:2.0.0',
      ],
      [
        'an identical local path',
        './dynamic-plugins/dist/test-plugin',
        './dynamic-plugins/dist/test-plugin',
      ],
    ])(
      'should show "Failed to load" for %s',
      async (_case, storedRef, catalogRef) => {
        renderPluginCard(mockPlugin, {
          pendingChanges: { ...noPendingChanges, failedInstalls: [storedRef] },
          packages: [pluginPackage('test-plugin', catalogRef)],
        });

        expect(await screen.findByText('Failed to load')).toBeInTheDocument();
      },
    );

    it.each([
      [
        'a selector shared by images in two repositories',
        'oci://quay.io/team-a/foo:1!frontend',
        'oci://quay.io/team-b/bar:2!frontend',
      ],
      [
        'an image name shared by two repositories',
        'oci://quay.io/team-a/shared-image:1.0.0',
        'oci://quay.io/team-b/shared-image:1.0.0',
      ],
      [
        'an image path shared by two registry ports',
        'oci://localhost:5000/example/test-plugin:1.0.0',
        'oci://localhost:5001/example/test-plugin:1.0.0',
      ],
      [
        'a file name shared by two local directories',
        './dynamic-plugins/dist/test-plugin',
        './other/dist/test-plugin',
      ],
    ])(
      'should not show "Failed to load" for %s',
      async (_case, storedRef, catalogRef) => {
        renderPluginCard(mockPlugin, {
          pendingChanges: { ...noPendingChanges, failedInstalls: [storedRef] },
          packages: [pluginPackage('test-plugin', catalogRef)],
        });

        await expect(screen.findByText('Failed to load')).rejects.toThrow();
      },
    );
  });

  describe('Install state from the packages', () => {
    const artifact = (name: string) =>
      `oci://quay.io/example/${name}@sha256:${'e'.repeat(64)}`;
    const loadedPlugins = [
      loadedPlugin('test-plugin-module-addons'),
      loadedPlugin('backstage-plugin-test-plugin-backend'),
    ];
    const slow = { timeout: 3000 };
    const withPluginStatus = (
      installStatus: ExtensionsPluginInstallStatus,
    ) => ({
      ...mockPlugin,
      spec: { ...mockPlugin.spec, installStatus },
    });

    it.each([
      ['NotInstalled', ExtensionsPluginInstallStatus.NotInstalled],
      [
        'Installed, as it still does after a restart',
        ExtensionsPluginInstallStatus.Installed,
      ],
    ])(
      'should offer "Install" and show no chip when its packages are not installed and the Plugin entity says %s',
      async (_case, pluginStatus) => {
        renderPluginCard(withPluginStatus(pluginStatus), {
          loadedPlugins,
          packages: [
            pluginPackage(
              'test-plugin',
              artifact('test-plugin'),
              ExtensionsPackageInstallStatus.NotInstalled,
            ),
            pluginPackage(
              'test-plugin-backend',
              artifact('test-plugin-backend'),
              ExtensionsPackageInstallStatus.NotInstalled,
            ),
          ],
        });

        expect(
          await screen.findByRole('button', { name: 'Install' }, slow),
        ).toBeInTheDocument();
        expect(screen.queryByText('Built-in')).not.toBeInTheDocument();
        expect(screen.queryByText('Installed')).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: 'Uninstall' }),
        ).not.toBeInTheDocument();
      },
    );

    it('should show "Installed" and offer "Uninstall" when its packages are installed and the Plugin entity says NotInstalled', async () => {
      renderPluginCard(
        withPluginStatus(ExtensionsPluginInstallStatus.NotInstalled),
        {
          loadedPlugins,
          packages: [
            pluginPackage(
              'test-plugin',
              artifact('test-plugin'),
              ExtensionsPackageInstallStatus.Installed,
            ),
            pluginPackage(
              'test-plugin-backend',
              artifact('test-plugin-backend'),
              ExtensionsPackageInstallStatus.Installed,
            ),
          ],
        },
      );

      expect(
        await screen.findByRole('button', { name: 'Uninstall' }, slow),
      ).toBeInTheDocument();
      expect(statusChip('Installed')?.className).toContain(
        'MuiChip-colorSuccess',
      );
    });

    it('should show "Built-in" for a loaded plugin that has no packages', async () => {
      renderPluginCard(mockPlugin, { loadedPlugins, packages: [] });

      await waitFor(() => expect(queryClient.isFetching()).toBe(0), slow);
      expect(screen.getByText('Built-in')).toBeInTheDocument();
      expect(
        await screen.findByRole('button', { name: 'Disable' }, slow),
      ).toBeInTheDocument();
    });
  });

  describe('Plugin Card Layout', () => {
    it('should render plugin title', () => {
      renderPluginCard(mockPlugin);
      expect(screen.getByText('Test Plugin')).toBeInTheDocument();
    });

    it('should render plugin author', () => {
      renderPluginCard(mockPlugin);
      expect(screen.getByText('by')).toBeInTheDocument();
      expect(screen.getByText('Test Author')).toBeInTheDocument();
    });

    it('should render plugin description', () => {
      renderPluginCard(mockPlugin);
      expect(screen.getByText('A test plugin for testing')).toBeInTheDocument();
    });

    it('should render "no description available" when description is missing', () => {
      const pluginWithoutDescription = {
        ...mockPlugin,
        metadata: {
          ...mockPlugin.metadata,
          description: undefined,
        },
      };

      renderPluginCard(pluginWithoutDescription);
      expect(screen.getByText('no description available')).toBeInTheDocument();
    });

    it('should render category tag', () => {
      renderPluginCard(mockPlugin);
      expect(screen.getByText('testing')).toBeInTheDocument();
    });

    it('should handle missing categories gracefully', () => {
      const pluginWithoutCategories = {
        ...mockPlugin,
        spec: {
          ...mockPlugin.spec,
          categories: undefined,
        },
      };

      renderPluginCard(pluginWithoutCategories);
      expect(screen.getByText('Test Plugin')).toBeInTheDocument();
      expect(screen.queryByText('testing')).not.toBeInTheDocument();
    });

    it('should truncate long category names', () => {
      const pluginWithLongCategory = {
        ...mockPlugin,
        spec: {
          ...mockPlugin.spec,
          categories: [
            'this-is-a-very-long-category-name-that-should-be-truncated',
          ],
        },
      };

      renderPluginCard(pluginWithLongCategory);
      expect(
        screen.getByText('this-is-a-very-long-categ...'),
      ).toBeInTheDocument();
    });

    it('should render "Read more" link', () => {
      renderPluginCard(mockPlugin);
      expect(screen.getByText('Read more')).toBeInTheDocument();
    });
  });
});
