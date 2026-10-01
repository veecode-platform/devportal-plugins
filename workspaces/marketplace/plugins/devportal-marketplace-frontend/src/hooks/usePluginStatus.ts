import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import {
  ExtensionsPackage,
  ExtensionsPackageInstallStatus,
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

// The Plugin entity's installStatus lags the Package statuses after a restart,
// so the card aggregates the Package statuses itself, with the rules of
// upstream's PluginInstallStatusProcessor.
const installStatusFromPackages = (
  packages: ExtensionsPackage[] | undefined,
): ExtensionsPluginInstallStatus | undefined => {
  if (!packages || packages.length === 0) return undefined;
  const statuses = packages.map(pkg => pkg.spec?.installStatus);
  if (statuses.includes(undefined)) return undefined;

  const count = (wanted: ExtensionsPackageInstallStatus) =>
    statuses.filter(status => status === wanted).length;
  if (count(ExtensionsPackageInstallStatus.Disabled) > 0) {
    return ExtensionsPluginInstallStatus.Disabled;
  }
  if (count(ExtensionsPackageInstallStatus.NotInstalled) === statuses.length) {
    return ExtensionsPluginInstallStatus.NotInstalled;
  }
  if (count(ExtensionsPackageInstallStatus.Installed) === statuses.length) {
    return ExtensionsPluginInstallStatus.Installed;
  }
  if (
    count(ExtensionsPackageInstallStatus.UpdateAvailable) > 0 &&
    count(ExtensionsPackageInstallStatus.NotInstalled) === 0
  ) {
    return ExtensionsPluginInstallStatus.UpdateAvailable;
  }
  return ExtensionsPluginInstallStatus.PartiallyInstalled;
};

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
  });

  return useMemo(() => {
    const installStatus =
      installStatusFromPackages(pluginPackages) ?? plugin.spec?.installStatus;
    const hasPackages = (pluginPackages ?? []).length > 0;
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
    const failedRefs = new Set(
      pendingChanges?.failedInstalls.map(normalizeRef),
    );
    const hasFailedInstall = (pluginPackages ?? []).some(pkg => {
      const artifact = pkg.spec?.dynamicArtifact;
      return artifact !== undefined && failedRefs.has(normalizeRef(artifact));
    });

    if (hasPendingInstall) return 'pending-install';
    if (hasPendingRemoval) return 'pending-removal';
    if (hasFailedInstall) return 'failed';

    // A plugin with packages is installed or not by its packages. Only one
    // without packages can be loaded without being installed, as built-in.
    const isLoaded = loadedNames.size > 0 && Array.from(loadedNames).some(
      name => name.includes(pluginName),
    );
    const isInstalledByUser =
      installStatus === ExtensionsPluginInstallStatus.Installed ||
      installStatus === ExtensionsPluginInstallStatus.PartiallyInstalled ||
      installStatus === ExtensionsPluginInstallStatus.UpdateAvailable;

    if (isLoaded && !isInstalledByUser && !hasPackages) return 'built-in';

    // Fall back to catalog install status
    if (installStatus === ExtensionsPluginInstallStatus.Disabled) return 'disabled';
    if (isInstalledByUser) return 'installed';

    return 'available';
  }, [plugin, loadedPlugins, pendingChanges, pluginPackages]);
};

const extractName = (pkg: string): string => {
  const ociIdx = pkg.indexOf('!');
  if (ociIdx !== -1) return pkg.substring(ociIdx + 1);
  const lastSlash = pkg.lastIndexOf('/');
  if (lastSlash !== -1) return pkg.substring(lastSlash + 1);
  return pkg;
};

// A stored ref and the catalog ref of the same image may differ in tag or
// digest, so those are dropped. The registry (with its port), the image path
// and the selector stay, since they tell two packages apart.
const normalizeRef = (ref: string): string => {
  if (!ref.startsWith('oci://')) return ref;
  const selectorIdx = ref.indexOf('!');
  const image = selectorIdx === -1 ? ref : ref.substring(0, selectorIdx);
  const selector = selectorIdx === -1 ? '' : ref.substring(selectorIdx);
  const nameIdx = image.lastIndexOf('/') + 1;
  return (
    image.substring(0, nameIdx) +
    image.substring(nameIdx).split(/[:@]/)[0] +
    selector
  );
};
