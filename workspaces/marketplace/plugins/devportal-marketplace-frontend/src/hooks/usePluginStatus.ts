import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import {
  ExtensionsPlugin,
  ExtensionsPluginInstallStatus,
} from '@red-hat-developer-hub/backstage-plugin-extensions-common';
import { dynamicPluginsInfoApiRef, extensionsApiRef } from '../api';

export type MarketplaceStatus =
  | 'available'
  | 'built-in'
  | 'installed'
  | 'disabled'
  | 'pending-install'
  | 'pending-removal'
  | 'failed';

interface PendingChangesResponse {
  count: number;
  pendingInstalls: string[];
  pendingRemovals: string[];
  failedInstalls: string[];
}

export const usePluginStatus = (plugin: ExtensionsPlugin): MarketplaceStatus => {
  const dynamicPluginsInfoApi = useApi(dynamicPluginsInfoApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const extensionsApi = useApi(extensionsApiRef);

  const { data: loadedPlugins } = useQuery({
    queryKey: ['loaded-plugins'],
    queryFn: () => dynamicPluginsInfoApi.listLoadedPlugins(),
    staleTime: 30_000,
  });

  const { data: pendingChanges } = useQuery<PendingChangesResponse>({
    queryKey: ['pending-changes'],
    queryFn: async () => {
      const baseUrl = await discoveryApi.getBaseUrl('extensions');
      const res = await fetchApi.fetch(`${baseUrl}/pending-changes`);
      if (!res.ok) {
        return {
          count: 0,
          pendingInstalls: [],
          pendingRemovals: [],
          failedInstalls: [],
        };
      }
      const body = await res.json();
      return { ...body, failedInstalls: body.failedInstalls ?? [] };
    },
    staleTime: 10_000,
  });

  const { data: pluginPackages } = useQuery({
    queryKey: [
      'extensionsApi',
      'getPluginPackages',
      plugin.metadata.namespace,
      plugin.metadata.name,
    ],
    queryFn: () =>
      extensionsApi.getPluginPackages(
        plugin.metadata.namespace!,
        plugin.metadata.name,
      ),
    enabled: (pendingChanges?.failedInstalls.length ?? 0) > 0,
  });

  return useMemo(() => {
    const installStatus = plugin.spec?.installStatus;
    const pluginName = plugin.metadata.name;

    const loadedNames = new Set(
      (loadedPlugins ?? []).map((p: { name: string }) => p.name),
    );

    // Check pending changes by scanning all pending lists for a name containing
    // the plugin's catalog name. This heuristic covers OCI and local paths.
    const hasPendingInstall = pendingChanges?.pendingInstalls?.some(
      pkg => extractName(pkg).includes(pluginName),
    ) ?? false;
    const hasPendingRemoval = pendingChanges?.pendingRemovals?.some(
      pkg => extractName(pkg).includes(pluginName),
    ) ?? false;
    const failedNames = new Set(
      pendingChanges?.failedInstalls.map(extractName),
    );
    const hasFailedInstall = (pluginPackages ?? []).some(pkg => {
      const artifact = pkg.spec?.dynamicArtifact;
      return artifact !== undefined && failedNames.has(extractName(artifact));
    });

    if (hasPendingInstall) return 'pending-install';
    if (hasPendingRemoval) return 'pending-removal';
    if (hasFailedInstall) return 'failed';

    // Check if loaded but not user-installed → built-in
    const isLoaded = loadedNames.size > 0 && Array.from(loadedNames).some(
      name => name.includes(pluginName),
    );
    const isInstalledByUser =
      installStatus === ExtensionsPluginInstallStatus.Installed ||
      installStatus === ExtensionsPluginInstallStatus.PartiallyInstalled ||
      installStatus === ExtensionsPluginInstallStatus.UpdateAvailable;

    if (isLoaded && !isInstalledByUser) return 'built-in';

    // Fall back to catalog install status
    if (installStatus === ExtensionsPluginInstallStatus.Disabled) return 'disabled';
    if (isInstalledByUser) return 'installed';

    return 'available';
  }, [plugin, loadedPlugins, pendingChanges, pluginPackages]);
};

const extractName = (pkg: string): string => {
  const ociIdx = pkg.indexOf('!');
  if (ociIdx !== -1) return pkg.substring(ociIdx + 1);
  if (pkg.startsWith('oci://')) {
    return pkg.substring(pkg.lastIndexOf('/') + 1).split(/[:@]/)[0];
  }
  const lastSlash = pkg.lastIndexOf('/');
  if (lastSlash !== -1) return pkg.substring(lastSlash + 1);
  return pkg;
};
