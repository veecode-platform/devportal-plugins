import { createTranslationRef } from '@backstage/core-plugin-api/alpha';

// Exported separately from the ref so tests can build a flat lookup without
// depending on the translation runtime (see ../test-utils/mockTranslations).
export const kongServiceManagerMessages = {
  homepage: {
    intro:
      "Manage this service's Kong API-gateway configuration: its routes and the plugins that shape traffic. A plugin takes effect in the gateway immediately; on a route, you can promote it to code — a merge request into the service's chart — to manage it from Git instead.",
    tabs: {
      service: 'Service',
      plugins: 'Plugins',
      routes: 'Routes',
    },
    createRoute: 'Create Route',
    pluginsScope:
      'Service plugins apply to every route this service exposes. To attach a plugin to a single route, use the Routes tab.',
    routesScope:
      'Each route can carry its own plugins. A route plugin applies only to that route and takes precedence over a service plugin of the same type.',
    pluginDisabled: 'Plugin "{{name}}" disabled',
    routeDeleted: 'Route deleted',
    pluginPromotionOpened:
      'Plugin "{{name}}" promotion opened — see the MR link on its badge',
    promotionDiscarded: 'Promotion for plugin "{{name}}" discarded',
    pluginUpdated: 'Plugin "{{name}}" updated',
    pluginEnabled: 'Plugin "{{name}}" enabled',
    routeUpdated: 'Route updated',
    routeCreated: 'Route created',
  },
  pluginConfigDrawer: {
    title: '{{pluginName}} Plugin',
    noConfigurableFields: 'No configurable fields for this plugin.',
    enabled: 'Enabled',
    cancel: 'Cancel',
    saving: 'Saving...',
    installing: 'Installing...',
    reviewPromotion: 'Review promotion',
    saveChanges: 'Save Changes',
    installPlugin: 'Install Plugin',
  },
  incrementalFields: {
    add: 'Add',
  },
  recordFields: {
    newItem: 'New Item',
    add: 'Add',
    addEmpty: 'Add Empty',
  },
  pluginCard: {
    editTooltip: 'Edit plugin configuration',
    enableTooltip: 'Attach this plugin in the gateway.',
    disableTooltip: 'Remove this plugin from the gateway.',
    promoteToCodeTooltip:
      "Open a merge request that moves this plugin into the service's chart, so it's managed from Git instead of only living in the gateway.",
    editInCodeTooltip:
      "This plugin is defined in the service's chart. Open a merge request to change it — nothing is changed in the gateway directly.",
    discardTooltip: 'Close the open merge request. The plugin stays as it is now.',
    discardPromotion: 'Discard promotion',
    disable: 'Disable',
    promoteToCode: 'Promote to code',
    editInCode: 'Edit in code',
    enable: 'Enable',
    managedFromRepository:
      'Managed from the repository — editing here would be overwritten by the next deploy.',
  },
  pluginsList: {
    title: 'Kong Plugins',
    searchPlaceholder: 'Search plugins...',
    noPluginsFiltered: 'No plugins match "{{search}}". Try a different search term.',
    noPluginsEmpty: 'No plugins available in this category yet.',
    allPlugins: 'All Plugins',
    associatedPlugins: 'Associated Plugins',
    categories: {
      ai: 'AI',
      authentication: 'Authentication',
      security: 'Security',
      trafficControl: 'Traffic Control',
      serverless: 'Serverless',
      transformation: 'Transformations',
      logging: 'Logging',
      analytics: 'Analytics & Monitoring',
    },
  },
  routeForm: {
    editTitle: 'Edit Route',
    createTitle: 'Create Route',
    nameLabel: 'Name',
    protocolsLabel: 'Protocols',
    methodsLabel: 'Methods',
    pathsLabel: 'Paths (comma-separated)',
    pathsHelper: 'e.g. /api/v1, /health',
    hostsLabel: 'Hosts (comma-separated)',
    hostsHelper: 'Optional, e.g. example.com',
    stripPath: 'Strip Path',
    stripPathTooltip: 'Remove the matched path prefix before forwarding the request to the service.',
    preserveHost: 'Preserve Host',
    preserveHostTooltip:
      "Forward the original Host header to the service instead of the upstream's own host.",
    cancel: 'Cancel',
    saving: 'Saving...',
    save: 'Save',
  },
  promotionBadgeChip: {
    kinds: {
      experimental: 'Experimental',
      codeOwned: 'Code-owned',
      mrOpen: 'Promotion open',
      pendingDeploy: 'Applying',
      codified: 'Codified',
      failedRestored: 'Application failed',
    },
    kindTooltips: {
      experimental:
        "Live in the gateway only — not yet saved to the service's Git repository.",
      mrOpen:
        'A merge request to add this experiment to the chart is open — merge and deploy it to make the plugin code-owned.',
      pendingDeploy:
        'The merge request merged; waiting for the new chart version to deploy so the plugin becomes code-owned.',
      codified:
        'This plugin is now defined in the chart and managed from Git — it replaced the original experiment.',
      failedRestored:
        'The automatic handover to the chart failed; fix the chart or revert the merge request to recover.',
    },
    codeOwnedTooltip: "Defined in the service's chart; edit it there",
    retry: 'Retry',
    showDetails: 'Show details',
    hideDetails: 'Hide details',
  },
  promotionReviewDialog: {
    editTitle: 'Edit {{pluginName}} in code',
    promoteTitle: 'Promote {{pluginName}} to code',
    editDescription:
      "This opens a merge request in the service's repository with the edited configuration. This plugin is already managed by the Kong Ingress Controller from the chart — no experiment is created, tagged, or removed.",
    promoteDescription:
      "This opens a merge request in the service's repository with the equivalent chart configuration. Once it merges and deploys, the portal verifies the code-owned plugin and removes this experiment.",
    liveConfigCurrent: 'Live config (current)',
    liveConfig: 'Live config',
    editedConfig: 'Edited config',
    generatedChart: 'Generated chart',
    generatingPreview: 'Generating preview...',
    cancel: 'Cancel',
    promoteToCode: 'Promote to code',
  },
  routePluginsDrawer: {
    title: 'Plugins for route: {{routeLabel}}',
    noOwningRepoReason: 'This service has no linked repository to open a merge request against.',
    noAdapterReason: "This plugin type can't be promoted to code yet.",
    searchPlaceholder: 'Search plugins...',
    noPluginsFiltered: 'No plugins match "{{search}}". Try a different search term.',
    noPluginsEmpty: 'No plugins available in this category yet.',
    allPlugins: 'All Plugins',
    associatedPlugins: 'Associated Plugins',
    categories: {
      ai: 'AI',
      authentication: 'Authentication',
      security: 'Security',
      trafficControl: 'Traffic Control',
      serverless: 'Serverless',
      transformation: 'Transformations',
      logging: 'Logging',
      analytics: 'Analytics & Monitoring',
    },
  },
  routesList: {
    title: 'Routes',
    routeCount: '{{total}} route(s)',
    noRoutes: 'No routes yet — create one to expose this service through the gateway.',
    columns: {
      name: 'Name',
      protocols: 'Protocols',
      methods: 'Methods',
      paths: 'Paths',
      hosts: 'Hosts',
      actions: 'Actions',
    },
    managePlugins: 'Manage plugins',
    editRoute: 'Edit route',
    deleteRoute: 'Delete route',
    deleteDialog: {
      title: 'Delete Route',
      confirmBefore: 'Are you sure you want to delete route',
      confirmAfter: '? This action cannot be undone.',
      cancel: 'Cancel',
      confirm: 'Delete',
    },
  },
  selectInstance: {
    label: 'Kong Instance',
  },
  servicePage: {
    idLabel: 'ID: {{id}}',
    enabled: 'Enabled',
    disabled: 'Disabled',
    noServiceInfo: 'No service information available.',
    fields: {
      protocol: 'Protocol',
      host: 'Host',
      port: 'Port',
      path: 'Path',
      retries: 'Retries',
      connectTimeout: 'Connect Timeout',
      writeTimeout: 'Write Timeout',
      readTimeout: 'Read Timeout',
    },
  },
} as const;

/**
 * Translation reference for the kong-service-manager plugin.
 *
 * @public
 */
export const kongServiceManagerTranslationRef = createTranslationRef({
  id: 'plugin.kong-service-manager',
  messages: kongServiceManagerMessages,
});
