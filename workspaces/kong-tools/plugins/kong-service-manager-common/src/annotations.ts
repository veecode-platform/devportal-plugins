import { Entity } from '@backstage/catalog-model';

/** Annotation key for the Kong service name */
export const KONG_SERVICE_NAME_ANNOTATION = 'kong-manager/service-name';

/** Annotation key for the Kong instance(s), comma-separated */
export const KONG_SERVICE_INSTANCE_ANNOTATION = 'kong-manager/instance';

/** Check whether an entity has the required Kong annotations */
export function isKongServiceManagerAvailable(entity: Entity): boolean {
  const serviceName =
    entity.metadata.annotations?.[KONG_SERVICE_NAME_ANNOTATION];
  return Boolean(serviceName);
}
