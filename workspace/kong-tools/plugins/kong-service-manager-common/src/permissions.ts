import { createPermission } from '@backstage/plugin-permission-common';

/** Permission to read Kong service information */
export const kongServiceReadPermission = createPermission({
  name: 'kong.service.read',
  attributes: { action: 'read' },
});

/** Permission to read available and associated Kong plugins */
export const kongPluginsReadPermission = createPermission({
  name: 'kong.plugins.read',
  attributes: { action: 'read' },
});

/** Permission to read Kong routes */
export const kongRoutesReadPermission = createPermission({
  name: 'kong.routes.read',
  attributes: { action: 'read' },
});

/** Permission to add a plugin to a Kong service */
export const kongApplyPluginServicePermission = createPermission({
  name: 'kong.plugin.service.apply',
  attributes: { action: 'create' },
});

/** Permission to update a plugin on a Kong service */
export const kongUpdateServicePluginPermission = createPermission({
  name: 'kong.plugin.service.update',
  attributes: { action: 'update' },
});

/** Permission to disable/remove a plugin from a Kong service */
export const kongDisableServicePluginPermission = createPermission({
  name: 'kong.plugin.service.disable',
  attributes: { action: 'delete' },
});

/** Permission to create a Kong route */
export const kongRouteCreatePermission = createPermission({
  name: 'kong.route.create',
  attributes: { action: 'create' },
});

/** Permission to update a Kong route */
export const kongRouteUpdatePermission = createPermission({
  name: 'kong.route.update',
  attributes: { action: 'update' },
});

/** Permission to delete a Kong route */
export const kongRouteDeletePermission = createPermission({
  name: 'kong.route.delete',
  attributes: { action: 'delete' },
});

/** Permission to add a plugin to a Kong route */
export const kongApplyPluginRoutePermission = createPermission({
  name: 'kong.plugin.route.apply',
  attributes: { action: 'create' },
});

/** Permission to update a plugin on a Kong route */
export const kongUpdateRoutePluginPermission = createPermission({
  name: 'kong.plugin.route.update',
  attributes: { action: 'update' },
});

/** Permission to disable/remove a plugin from a Kong route */
export const kongDisableRoutePluginPermission = createPermission({
  name: 'kong.plugin.route.disable',
  attributes: { action: 'delete' },
});

/** All Kong Service Manager permissions */
export const kongPermissions = [
  kongServiceReadPermission,
  kongPluginsReadPermission,
  kongRoutesReadPermission,
  kongApplyPluginServicePermission,
  kongUpdateServicePluginPermission,
  kongDisableServicePluginPermission,
  kongRouteCreatePermission,
  kongRouteUpdatePermission,
  kongRouteDeletePermission,
  kongApplyPluginRoutePermission,
  kongUpdateRoutePluginPermission,
  kongDisableRoutePluginPermission,
];
