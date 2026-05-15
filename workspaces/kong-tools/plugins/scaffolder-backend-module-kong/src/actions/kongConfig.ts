import { Config } from '@backstage/config';

export type ResolvedKongConnection = {
  kongAddr: string;
  headers: string; // deck --headers format: "Key1:Value1,Key2:Value2"
};

export function resolveKongInstance(
  config: Config,
  instanceId: string,
): ResolvedKongConnection {
  const instances = config.getConfigArray('kong.instances');
  const instance = instances.find(c => c.getString('id') === instanceId);
  if (!instance) {
    throw new Error(
      `Kong instance '${instanceId}' not found in kong.instances config`,
    );
  }

  const apiBaseUrl = instance.getString('apiBaseUrl');
  const workspace = instance.getOptionalString('workspace');
  const kongAddr = workspace
    ? `${apiBaseUrl.replace(/\/$/, '')}/${workspace}`
    : apiBaseUrl;

  // Build deck --headers value
  const headerParts: string[] = [];
  if (instance.has('auth.kongAdmin')) {
    const token = instance.getString('auth.kongAdmin');
    if (token) headerParts.push(`Kong-Admin-Token:${token}`);
  } else if (instance.has('auth.custom')) {
    const header = instance.getString('auth.custom.header');
    const value = instance.getString('auth.custom.value');
    headerParts.push(`${header}:${value}`);
  }

  return {
    kongAddr,
    headers: headerParts.join(','),
  };
}
