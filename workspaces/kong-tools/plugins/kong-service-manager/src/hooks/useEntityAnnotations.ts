import { useEntity } from '@backstage/plugin-catalog-react';
import {
  KONG_SERVICE_NAME_ANNOTATION,
  KONG_SERVICE_INSTANCE_ANNOTATION,
} from '@veecode-platform/backstage-plugin-kong-service-manager-common';

export function useEntityAnnotations() {
  const { entity } = useEntity();
  const annotations = entity.metadata.annotations ?? {};

  const serviceName = annotations[KONG_SERVICE_NAME_ANNOTATION] ?? '';
  const instancesRaw = annotations[KONG_SERVICE_INSTANCE_ANNOTATION] ?? '';
  const instances = instancesRaw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  return { serviceName, instances };
}
