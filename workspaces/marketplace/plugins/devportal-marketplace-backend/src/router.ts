import express, { Request, Response, NextFunction } from 'express';
import Router from 'express-promise-router';
import { InputError, NotAllowedError } from '@backstage/errors';
import type { Config } from '@backstage/config';

import {
  HttpAuthService,
  PermissionsService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import {
  AuthorizeResult,
  BasicPermission,
  PolicyDecision,
  ResourcePermission,
} from '@backstage/plugin-permission-common';

import {
  decodeGetEntitiesRequest,
  decodeGetEntityFacetsRequest,
  extensionsPluginWritePermission,
  extensionsPluginReadPermission,
  ExtensionsApi,
  ExtensionsPlugin,
  RESOURCE_TYPE_EXTENSIONS_PLUGIN,
  extensionsPermissions,
} from '@red-hat-developer-hub/backstage-plugin-extensions-common';
import { createPermissionIntegrationRouter } from '@backstage/plugin-permission-node';
import { createSearchParams } from './utils/createSearchParams';
import { removeVerboseSpecContent } from './utils/removeVerboseSpecContent';
import { rules as extensionRules } from './permissions/rules';
import { matches } from './utils/permissionUtils';
import { InstallationDataService } from './installation/InstallationDataService';
import { ConfigFormatError } from './errors/ConfigFormatError';
import { Document, isMap, isSeq, parseDocument } from 'yaml';
import { toBlockStyle } from './utils/yamlFormat';
import { DEFAULT_NAMESPACE } from '@backstage/catalog-model';

import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import {
  BaseDynamicPlugin,
  DynamicPluginProvider,
} from '@backstage/backend-dynamic-feature-service';

export type ExtensionsRouterOptions = {
  httpAuth: HttpAuthService;
  extensionsApi: ExtensionsApi;
  permissions: PermissionsService;
  installationDataService: InstallationDataService;
  pluginProvider: DynamicPluginProvider;
  logger: LoggerService;
  config: Config;
};

export async function createRouter(
  options: ExtensionsRouterOptions,
): Promise<express.Router> {
  const {
    httpAuth,
    extensionsApi,
    permissions,
    installationDataService,
    pluginProvider,
    logger,
    config,
  } = options;

  const requireInitializedInstallationDataService = (
    _req: Request,
    _res: Response,
    next: NextFunction,
  ) => {
    const error = installationDataService.getInitializationError();
    if (error) {
      throw error;
    }
    next();
  };

  const router = Router();
  const permissionsIntegrationRouter = createPermissionIntegrationRouter({
    resourceType: RESOURCE_TYPE_EXTENSIONS_PLUGIN,
    permissions: extensionsPermissions,
    rules: Object.values(extensionRules),
  });
  router.use(express.json());
  router.use(permissionsIntegrationRouter);

  const authorizeConditional = async (
    request: Request,
    permission: ResourcePermission<'extensions-plugin'> | BasicPermission,
  ) => {
    const credentials = await httpAuth.credentials(request);
    let decision: PolicyDecision;
    // No permission configured, always allow.
    if (!permission) {
      return { result: AuthorizeResult.ALLOW };
    }

    if (permission.type === 'resource') {
      decision = (
        await permissions.authorizeConditional([{ permission }], {
          credentials,
        })
      )[0];
    } else {
      decision = (
        await permissions.authorize([{ permission }], {
          credentials,
        })
      )[0];
    }

    return decision;
  };

  const getAuthorizedPlugin = async (
    request: Request,
    permission: ResourcePermission<'extensions-plugin'> | BasicPermission,
  ) => {
    const decision = await authorizeConditional(request, permission);

    if (decision.result === AuthorizeResult.DENY) {
      throw new NotAllowedError(
        `Not allowed to ${permission.attributes.action} the configuration of ${request.params.namespace}:${request.params.name}`,
      );
    }

    const plugin = await extensionsApi.getPluginByName(
      request.params.namespace,
      request.params.name,
    );

    const hasAccess =
      decision.result === AuthorizeResult.ALLOW ||
      (decision.result === AuthorizeResult.CONDITIONAL &&
        matches(plugin, decision.conditions));
    if (!hasAccess) {
      throw new NotAllowedError(
        `Not allowed to ${permission.attributes.action} the configuration of ${request.params.namespace}:${request.params.name}`,
      );
    }

    return plugin;
  };

  const getAuthorizedPackage = async (
    request: Request,
    permission: ResourcePermission<'extensions-plugin'> | BasicPermission,
  ) => {
    const decision = await authorizeConditional(request, permission);

    if (decision.result === AuthorizeResult.DENY) {
      throw new NotAllowedError(
        `Not allowed to ${permission.attributes.action} the configuration of ${request.params.namespace}:${request.params.name}`,
      );
    }

    const packagePlugins = await extensionsApi.getPackagePlugins(
      request.params.namespace,
      request.params.name,
    );
    const hasAccess =
      decision.result === AuthorizeResult.ALLOW ||
      (decision.result === AuthorizeResult.CONDITIONAL &&
        packagePlugins.some(plugin => matches(plugin, decision.conditions)));
    if (!hasAccess) {
      throw new NotAllowedError(
        `Not allowed to ${permission.attributes.action} the configuration of ${request.params.namespace}:${request.params.name}`,
      );
    }

    return await extensionsApi.getPackageByName(
      request.params.namespace,
      request.params.name,
    );
  };

  // ─── Collection routes ──────────────────────────────────────────────

  router.get('/collections', async (req, res) => {
    const request = decodeGetEntitiesRequest(createSearchParams(req));
    const collections = await extensionsApi.getCollections(request);
    res.json(collections);
  });

  router.get('/collections/facets', async (req, res) => {
    const request = decodeGetEntityFacetsRequest(createSearchParams(req));
    const facets = await extensionsApi.getCollectionsFacets(request);
    res.json(facets);
  });

  router.get('/collection/:namespace/:name', async (req, res) => {
    const collection = await extensionsApi.getCollectionByName(
      req.params.namespace,
      req.params.name,
    );
    res.json(collection);
  });

  router.get('/collection/:namespace/:name/plugins', async (req, res) => {
    const plugins = await extensionsApi.getCollectionPlugins(
      req.params.namespace,
      req.params.name,
    );
    res.json(removeVerboseSpecContent(plugins));
  });

  // ─── Package routes ─────────────────────────────────────────────────

  router.get('/packages', async (req, res) => {
    const request = decodeGetEntitiesRequest(createSearchParams(req));
    const packages = await extensionsApi.getPackages(request);
    res.json({ ...packages, items: removeVerboseSpecContent(packages.items) });
  });

  router.get('/packages/facets', async (req, res) => {
    const request = decodeGetEntityFacetsRequest(createSearchParams(req));
    const facets = await extensionsApi.getPackagesFacets(request);
    res.json(facets);
  });

  router.get('/package/:namespace/:name', async (req, res) => {
    res.json(
      await extensionsApi.getPackageByName(
        req.params.namespace,
        req.params.name,
      ),
    );
  });

  router.get(
    '/package/:namespace/:name/configuration',
    requireInitializedInstallationDataService,
    async (req, res) => {
      const extensionsPackage = await getAuthorizedPackage(
        req,
        extensionsPluginReadPermission,
      );

      if (!extensionsPackage.spec?.dynamicArtifact) {
        throw new Error(
          `Package catalog entity ${extensionsPackage.metadata.name} is missing 'spec.dynamicArtifact'`,
        );
      }
      const result = await installationDataService.getPackageConfig(
        extensionsPackage.spec?.dynamicArtifact,
      );
      res.status(200).json({ configYaml: result });
    },
  );

  router.post(
    '/package/:namespace/:name/configuration',
    requireInitializedInstallationDataService,
    async (req, res) => {
      const extensionsPackage = await getAuthorizedPackage(
        req,
        extensionsPluginWritePermission,
      );
      if (!extensionsPackage.spec?.dynamicArtifact) {
        throw new Error(
          `Package ${extensionsPackage.metadata.name} is missing 'spec.dynamicArtifact'`,
        );
      }

      const newConfig = req.body.configYaml;
      if (!newConfig) {
        throw new InputError("'configYaml' object must be present");
      }
      try {
        await installationDataService.updatePackageConfig(
          extensionsPackage.spec.dynamicArtifact,
          newConfig,
        );
        changedThisSession.add(extensionsPackage.spec.dynamicArtifact);
      } catch (e) {
        if (e instanceof ConfigFormatError) {
          throw new InputError(e.message);
        }
        throw e;
      }
      res.status(200).json({ status: 'OK' });
    },
  );

  router.patch(
    '/package/:namespace/:name/configuration/disable',
    requireInitializedInstallationDataService,
    async (req, res) => {
      const extensionsPackage = await getAuthorizedPackage(
        req,
        extensionsPluginWritePermission,
      );

      if (!extensionsPackage.spec?.dynamicArtifact) {
        throw new Error(
          `Package catalog entity ${extensionsPackage.metadata.name} is missing 'spec.dynamicArtifact'`,
        );
      }

      const disabled = req.body.disabled;
      if (typeof disabled !== 'boolean') {
        throw new InputError("'disabled' must be present boolean");
      }

      if (!disabled) {
        // Install: apply auto-config from appConfigExamples
        try {
          const existingConfig = await installationDataService.getPackageConfig(
            extensionsPackage.spec.dynamicArtifact,
          );
          const yamlStr = buildPackageYaml(
            extensionsPackage.spec.dynamicArtifact,
            disabled,
            extensionsPackage,
            existingConfig,
          );
          await installationDataService.updatePackageConfig(
            extensionsPackage.spec.dynamicArtifact,
            yamlStr,
          );
        } catch (e) {
          // Fallback: simple disable toggle without pluginConfig
          logger.warn(
            `Auto-config failed for ${extensionsPackage.spec.dynamicArtifact}, falling back to simple install: ${e}`,
          );
          await installationDataService.setPackageDisabled(
            extensionsPackage.spec.dynamicArtifact,
            disabled,
          );
        }
      } else {
        // Disable: no auto-config needed
        await installationDataService.setPackageDisabled(
          extensionsPackage.spec.dynamicArtifact,
          disabled,
        );
      }
      changedThisSession.add(extensionsPackage.spec.dynamicArtifact);
      res.status(200).json({ status: 'OK' });
    },
  );

  // ─── Plugin routes ──────────────────────────────────────────────────

  router.get('/plugins', async (req, res) => {
    const request = decodeGetEntitiesRequest(createSearchParams(req));
    const plugins = await extensionsApi.getPlugins(request);
    res.json({ ...plugins, items: removeVerboseSpecContent(plugins.items) });
  });

  router.get('/plugins/facets', async (req, res) => {
    const request = decodeGetEntityFacetsRequest(createSearchParams(req));
    const facets = await extensionsApi.getPluginFacets(request);
    res.json(facets);
  });

  router.get('/plugin/:namespace/:name', async (req, res) => {
    const plugin = await extensionsApi.getPluginByName(
      req.params.namespace,
      req.params.name,
    );
    res.json(plugin);
  });

  router.get(
    '/plugin/:namespace/:name/configuration/authorize',
    async (req, res) => {
      const [readDecision, installDecision] = await Promise.all([
        authorizeConditional(req, extensionsPluginReadPermission),
        authorizeConditional(req, extensionsPluginWritePermission),
      ]);
      if (
        readDecision.result === AuthorizeResult.DENY &&
        installDecision.result === AuthorizeResult.DENY
      ) {
        res.status(200).json({ read: 'DENY', write: 'DENY' });
        return;
      }

      let authorizedActions = {};

      // Pre-fetch plugin if either decision needs conditional evaluation
      // to avoid duplicate fetches from concurrent promises.
      let plugin: ExtensionsPlugin | undefined;
      if (
        readDecision.result === AuthorizeResult.CONDITIONAL ||
        installDecision.result === AuthorizeResult.CONDITIONAL
      ) {
        plugin = await extensionsApi.getPluginByName(
          req.params.namespace,
          req.params.name,
        );
      }

      const evaluateConditional = (
        decision: PolicyDecision,
        action: string,
      ) => {
        if (decision.result === AuthorizeResult.CONDITIONAL) {
          if (plugin && matches(plugin, decision.conditions)) {
            authorizedActions = { ...authorizedActions, [action]: 'ALLOW' };
          }
        } else if (decision.result === AuthorizeResult.ALLOW) {
          authorizedActions = { ...authorizedActions, [action]: 'ALLOW' };
        }
      };

      evaluateConditional(readDecision, 'read');
      evaluateConditional(installDecision, 'write');

      if (Object.keys(authorizedActions).length === 0) {
        res.status(200).json({ read: 'DENY', write: 'DENY' });
      } else {
        res.status(200).json(authorizedActions);
      }
    },
  );

  router.get(
    '/plugin/:namespace/:name/configuration',
    requireInitializedInstallationDataService,
    async (req, res) => {
      const plugin = await getAuthorizedPlugin(
        req,
        extensionsPluginReadPermission,
      );
      const result = await installationDataService.getPluginConfig(plugin);
      res.status(200).json({ configYaml: result });
    },
  );

  router.post(
    '/plugin/:namespace/:name/configuration',
    requireInitializedInstallationDataService,
    async (req, res) => {
      const plugin = await getAuthorizedPlugin(
        req,
        extensionsPluginWritePermission,
      );

      const newConfig = req.body.configYaml;
      if (!newConfig) {
        throw new InputError("'configYaml' object must be present");
      }

      // Store what the editor sent. Only a package entry that comes without
      // pluginConfig gets the Package's appConfigExamples[0].
      const packages = await extensionsApi.getPluginPackages(
        plugin.metadata.namespace ?? DEFAULT_NAMESPACE,
        plugin.metadata.name,
      );
      try {
        await installationDataService.updatePluginConfig(
          plugin,
          withExamplePluginConfig(newConfig, packages),
        );
      } catch (e) {
        if (e instanceof ConfigFormatError) {
          throw new InputError(e.message);
        }
        throw e;
      }
      for (const pkg of packages) {
        if (pkg.spec?.dynamicArtifact) {
          changedThisSession.add(pkg.spec.dynamicArtifact);
        }
      }
      res.status(200).json({ status: 'OK' });
    },
  );

  router.patch(
    '/plugin/:namespace/:name/configuration/disable',
    requireInitializedInstallationDataService,
    async (req, res) => {
      const plugin = await getAuthorizedPlugin(
        req,
        extensionsPluginWritePermission,
      );
      const disabled = req.body.disabled;
      if (typeof disabled !== 'boolean') {
        throw new InputError("'disabled' must be present boolean");
      }

      if (!disabled) {
        // Install: apply auto-config for each package in this plugin
        const packages = await extensionsApi.getPluginPackages(
          plugin.metadata.namespace ?? DEFAULT_NAMESPACE,
          plugin.metadata.name,
        );
        for (const pkg of packages) {
          const artifact = pkg.spec?.dynamicArtifact;
          if (!artifact) continue;

          try {
            const existingConfig =
              await installationDataService.getPackageConfig(artifact);
            const yamlStr = buildPackageYaml(
              artifact,
              disabled,
              pkg,
              existingConfig,
            );
            await installationDataService.updatePackageConfig(artifact, yamlStr);
          } catch (e) {
            logger.warn(
              `Auto-config failed for ${artifact}, falling back to simple install: ${e}`,
            );
            await installationDataService.setPackageDisabled(artifact, disabled);
          }
          changedThisSession.add(artifact);
        }
      } else {
        // Disable: no auto-config needed, but track for pending-changes
        const disablePackages = await extensionsApi.getPluginPackages(
          plugin.metadata.namespace ?? DEFAULT_NAMESPACE,
          plugin.metadata.name,
        );
        await installationDataService.setPluginDisabled(plugin, disabled);
        for (const pkg of disablePackages) {
          if (pkg.spec?.dynamicArtifact) {
            changedThisSession.add(pkg.spec.dynamicArtifact);
          }
        }
      }
      res.status(200).json({ status: 'OK' });
    },
  );

  router.get('/plugin/:namespace/:name/packages', async (req, res) => {
    const packages = await extensionsApi.getPluginPackages(
      req.params.namespace,
      req.params.name,
    );
    res.json(packages);
  });

  // ─── Loaded plugins (dynamic plugin provider) ──────────────────────

  let dynamicPlugins: BaseDynamicPlugin[] = [];
  try {
    const plugins = pluginProvider.plugins();
    dynamicPlugins = plugins.map(p => {
      if (p.platform === 'node') {
        const { installer, ...rest } = p;
        return rest as BaseDynamicPlugin;
      }
      return p as BaseDynamicPlugin;
    });
  } catch (e) {
    logger.warn(
      `Failed to retrieve dynamic plugins list: ${e}. /loaded-plugins will return empty.`,
    );
  }

  router.get('/loaded-plugins', async (req, response) => {
    await httpAuth.credentials(req, { allow: ['user', 'service'] });
    response.send(dynamicPlugins);
  });

  // ─── Pending changes (diff install file vs loaded) ─────────────────

  /**
   * Extract a comparable plugin name from an artifact reference.
   * Handles OCI (`oci://host/repo:tag!name`), local paths
   * (`./dynamic-plugins/dist/name`), and plain names.
   */
  const extractPluginName = (pkg: string): string => {
    // OCI format: oci://registry/repo:tag!package-name
    const ociIdx = pkg.indexOf('!');
    if (ociIdx !== -1) {
      return pkg.substring(ociIdx + 1);
    }
    // Local path: ./dynamic-plugins/dist/package-name
    const lastSlash = pkg.lastIndexOf('/');
    if (lastSlash !== -1) {
      return pkg.substring(lastSlash + 1);
    }
    return pkg;
  };

  /**
   * A stored ref does not name its loaded plugin: a ref without a !selector
   * carries only the image, and the loaded name is the package.json name of
   * the extracted folder, which the selector does not reproduce either.
   * Upstream's DynamicPackageInstallStatusProcessor (catalog-backend-module-
   * extensions) matches a Package entity's spec.packageName against the loaded
   * names, with the scope and the "-dynamic" suffix optional. Same rule here.
   */
  const pluginKey = (name: string): string =>
    name
      .replace('@', '')
      .replace(/\//g, '-')
      .replace(/(-dynamic)+$/, '');
  const loadedNames = new Set(dynamicPlugins.map(p => p.name));
  const loadedPluginKeys = new Set(dynamicPlugins.map(p => pluginKey(p.name)));
  // A ref's packageNames never change, so a resolved ref is looked up once.
  // A ref with no entity is looked up again: the catalog may still be loading.
  // Several entities can share one ref, so it maps to every packageName seen.
  const packageNamesByRef = new Map<string, Set<string>>();

  /**
   * Fills packageNamesByRef for the refs the catalog can identify. A ref with
   * no entity, or a catalog that does not answer in full, stays unresolved.
   */
  const resolvePackageNames = async (refs: string[]): Promise<void> => {
    const unresolved = refs.filter(ref => !packageNamesByRef.has(ref));
    if (unresolved.length === 0) {
      return;
    }
    try {
      // Well above the whole index (175 packages), so no ref can push
      // another one off the page.
      const { items, totalItems } = await extensionsApi.getPackages({
        filter: { 'spec.dynamicArtifact': unresolved },
        fields: ['spec.packageName', 'spec.dynamicArtifact'],
        limit: 500,
      });
      if (totalItems > items.length) {
        throw new Error(`got ${items.length} of ${totalItems} packages`);
      }
      for (const { spec } of items) {
        if (spec?.dynamicArtifact && spec.packageName) {
          const names =
            packageNamesByRef.get(spec.dynamicArtifact) ?? new Set<string>();
          packageNamesByRef.set(
            spec.dynamicArtifact,
            names.add(spec.packageName),
          );
        }
      }
    } catch (e) {
      logger.warn(
        `Could not look up ${unresolved.length} stored package(s) in the catalog, so their loaded state comes from the name in the ref: ${e}`,
      );
    }
  };

  /**
   * Whether the plugin of a stored ref is loaded. A ref the catalog resolved is
   * loaded when a loaded plugin matches one of its entities' packageNames;
   * either way the name in the ref still counts, so a ref that matched before
   * still does, and an unresolved ref is decided by that name alone.
   */
  const isLoaded = (ref: string): boolean =>
    loadedNames.has(extractPluginName(ref)) ||
    [...(packageNamesByRef.get(ref) ?? [])].some(name =>
      loadedPluginKeys.has(pluginKey(name)),
    );

  // Track packages changed during THIS session (after startup).
  // Only these are truly "pending" — they haven't had a chance to load/unload yet.
  const changedThisSession = new Set<string>();

  /**
   * Builds a YAML string for a single package entry, optionally including
   * pluginConfig from the Package entity's appConfigExamples[0].content.
   *
   * Always returns a YAML map (not sequence), because
   * updatePackageConfig → validatePackageFormat expects isMap(contents).
   * Note: getPackageConfig() returns a YAML sequence (via toStringYaml),
   * so we extract the map item from it, not return it as-is.
   */
  const buildPackageYaml = (
    dynamicArtifact: string,
    disabled: boolean,
    extensionsPackage: { spec?: { appConfigExamples?: Array<{ title?: string; content?: unknown }> } },
    existingConfig: string | undefined,
  ): string => {
    // Extract existing pluginConfig if present.
    // getPackageConfig returns a YAML sequence: "- package: ...\n  pluginConfig: ..."
    // We parse it and pull pluginConfig from the first (only) map item.
    let existingPluginConfig: unknown | undefined;
    if (existingConfig) {
      try {
        const doc = parseDocument(existingConfig);
        const seq = doc.contents as any;
        const firstItem = seq?.items?.[0];
        if (firstItem?.has?.('pluginConfig')) {
          existingPluginConfig = firstItem.toJSON?.().pluginConfig;
        }
      } catch {
        // If parsing fails, treat as no existing config
      }
    }

    // Always build a fresh document (single map, not sequence)
    const entry: Record<string, unknown> = {
      package: dynamicArtifact,
      disabled,
    };

    if (existingPluginConfig) {
      // Preserve manually-edited pluginConfig
      entry.pluginConfig = existingPluginConfig;
    } else {
      // Try to apply appConfigExamples[0].content as default pluginConfig
      try {
        const appConfigExamples = extensionsPackage.spec?.appConfigExamples;
        if (
          Array.isArray(appConfigExamples) &&
          appConfigExamples.length > 0 &&
          appConfigExamples[0].content &&
          typeof appConfigExamples[0].content === 'object'
        ) {
          entry.pluginConfig = appConfigExamples[0].content;
        }
      } catch (e) {
        logger.warn(
          `Failed to read appConfigExamples for ${dynamicArtifact}: ${e}`,
        );
      }
    }

    const doc = new Document(entry);
    toBlockStyle(doc.contents);
    return doc.toString({ lineWidth: 120 });
  };

  /**
   * Adds the Package's appConfigExamples[0].content as pluginConfig to each
   * entry of the editor's YAML that has none. Entries that carry a
   * pluginConfig are kept as typed. YAML that is not a sequence is returned
   * unchanged, so updatePluginConfig reports the format error.
   */
  const withExamplePluginConfig = (
    configYaml: string,
    packages: Array<{
      spec?: {
        dynamicArtifact?: string;
        appConfigExamples?: Array<{ title?: string; content?: unknown }>;
      };
    }>,
  ): string => {
    const doc = parseDocument(configYaml);
    if (doc.errors.length > 0 || !isSeq(doc.contents)) {
      return configYaml;
    }

    let changed = false;
    doc.contents.items.forEach((item, index) => {
      if (!isMap(item) || item.has('pluginConfig')) return;
      const example = packages.find(
        pkg => pkg.spec?.dynamicArtifact === item.get('package'),
      )?.spec?.appConfigExamples?.[0]?.content;
      if (example && typeof example === 'object') {
        doc.setIn([index, 'pluginConfig'], doc.createNode(example));
        changed = true;
      }
    });
    if (!changed) {
      return configYaml;
    }
    toBlockStyle(doc.contents);
    return doc.toString({ lineWidth: 120 });
  };

  router.get(
    '/pending-changes',
    requireInitializedInstallationDataService,
    async (_req, response) => {
      const installedPackages =
        await installationDataService.getAllInstalledPackages();

      // Only a row that can land in a list needs its plugin looked up: an
      // enabled one, or a disabled one changed in this session.
      await resolvePackageNames(
        installedPackages
          .filter(
            entry =>
              (!entry.disabled || changedThisSession.has(entry.package)) &&
              !loadedNames.has(extractPluginName(entry.package)),
          )
          .map(entry => entry.package),
      );

      const pendingInstalls: string[] = [];
      const pendingRemovals: string[] = [];
      const failedInstalls: string[] = [];

      for (const entry of installedPackages) {
        const loaded = isLoaded(entry.package);
        if (!entry.disabled && !loaded) {
          if (changedThisSession.has(entry.package)) {
            pendingInstalls.push(entry.package);
          } else if (packageNamesByRef.has(entry.package)) {
            // Left out when the catalog cannot say which plugin the ref
            // should have loaded: a false "failed" costs more than a missed one.
            failedInstalls.push(entry.package);
          }
        }
        if (entry.disabled && loaded) {
          if (changedThisSession.has(entry.package)) {
            pendingRemovals.push(entry.package);
          }
          // Disabled before startup but still loaded: the deploy configuration
          // enables it and wins over the marketplace row, so nothing is pending.
        }
      }

      // Stale entries are NOT auto-removed. They represent installs from
      // previous sessions that either loaded successfully (and are fine)
      // or failed to load (user can investigate). Auto-removing was too
      // aggressive — it deleted legitimate installs after every restart
      // because changedThisSession resets on startup.

      response.json({
        count: pendingInstalls.length + pendingRemovals.length,
        pendingInstalls,
        pendingRemovals,
        failedInstalls,
      });
    },
  );

  const middleware = MiddlewareFactory.create({ logger, config });
  router.use(middleware.error());

  return router;
}
