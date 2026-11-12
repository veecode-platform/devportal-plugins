import type { Entity } from '@backstage/catalog-model';

const HTTP_URL = /^https?:\/\/[^\s]+$/;

/**
 * The app's addresses: the links of its catalog entry that have the configured
 * type and an http or https address. The title is the catalog's own text.
 */
export function addressesOf(system: Entity, addressLinkType: string) {
  return (system.metadata.links ?? [])
    .filter(link => link.type === addressLinkType && HTTP_URL.test(link.url))
    .map(link => ({
      url: link.url,
      ...(link.title ? { title: link.title } : {}),
    }));
}
