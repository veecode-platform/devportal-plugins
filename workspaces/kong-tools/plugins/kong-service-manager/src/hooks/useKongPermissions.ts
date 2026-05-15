import { usePermission } from '@backstage/plugin-permission-react';
import {
  kongApplyPluginServicePermission,
  kongUpdateServicePluginPermission,
  kongDisableServicePluginPermission,
  kongRouteCreatePermission,
  kongRouteUpdatePermission,
  kongRouteDeletePermission,
  kongApplyPluginRoutePermission,
  kongUpdateRoutePluginPermission,
  kongDisableRoutePluginPermission,
} from '@veecode-platform/backstage-plugin-kong-service-manager-common';

export function useKongPermissions() {
  const addServicePlugin = usePermission({ permission: kongApplyPluginServicePermission });
  const updateServicePlugin = usePermission({ permission: kongUpdateServicePluginPermission });
  const disableServicePlugin = usePermission({ permission: kongDisableServicePluginPermission });
  const createRoute = usePermission({ permission: kongRouteCreatePermission });
  const updateRoute = usePermission({ permission: kongRouteUpdatePermission });
  const deleteRoute = usePermission({ permission: kongRouteDeletePermission });
  const addRoutePlugin = usePermission({ permission: kongApplyPluginRoutePermission });
  const updateRoutePlugin = usePermission({ permission: kongUpdateRoutePluginPermission });
  const disableRoutePlugin = usePermission({ permission: kongDisableRoutePluginPermission });

  const loading =
    addServicePlugin.loading ||
    updateServicePlugin.loading ||
    disableServicePlugin.loading ||
    createRoute.loading ||
    updateRoute.loading ||
    deleteRoute.loading ||
    addRoutePlugin.loading ||
    updateRoutePlugin.loading ||
    disableRoutePlugin.loading;

  return {
    loading,
    canAddServicePlugin: addServicePlugin.allowed,
    canUpdateServicePlugin: updateServicePlugin.allowed,
    canDisableServicePlugin: disableServicePlugin.allowed,
    canCreateRoute: createRoute.allowed,
    canUpdateRoute: updateRoute.allowed,
    canDeleteRoute: deleteRoute.allowed,
    canAddRoutePlugin: addRoutePlugin.allowed,
    canUpdateRoutePlugin: updateRoutePlugin.allowed,
    canDisableRoutePlugin: disableRoutePlugin.allowed,
  };
}
