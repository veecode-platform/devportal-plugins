export * from './plugin';

export * from './alpha';

/**
 * Visit recorder for the `application/listener` mount point.
 *
 * The v3 shell does not mount a `VisitListener` itself, so the plugin that owns
 * the `visitsApiRef` storage has to provide the recorder too — otherwise nothing
 * ever calls `visitsApiRef.save()` and the visited cards stay empty.
 *
 * Re-exported explicitly because nothing in this package references it, and the
 * dynamic-plugin build would tree-shake it out of the bundle.
 */
export { VisitListener } from '@backstage/plugin-home';
