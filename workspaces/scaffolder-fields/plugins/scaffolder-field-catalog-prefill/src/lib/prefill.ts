import { Entity } from '@backstage/catalog-model';
import { getEntityValue, toFieldValue } from './entityPath';
import { CatalogEntityPrefillOptions, StepData, whenMatches } from './options';

export interface PrefillTransition {
  next: StepData;
  /** The entity ref to load, when the change selected one. */
  load?: string;
  /** True when a pending load, if any, no longer applies. */
  reset: boolean;
}

function blankTargets(options: CatalogEntityPrefillOptions): StepData {
  return Object.fromEntries(Object.keys(options.fill).map(key => [key, '']));
}

/**
 * Decides what a change of the step's data means for the prefill. The ref is
 * cleared with an explicit `undefined`, because the scaffolder stepper merges
 * each change into its state and would keep a key that is merely absent.
 */
export function applyChange(
  previous: StepData,
  incoming: StepData,
  options: CatalogEntityPrefillOptions,
): PrefillTransition {
  const { entityRefField, when } = options;

  if (when && Object.keys(when).some(key => incoming[key] !== previous[key])) {
    return {
      next: {
        ...incoming,
        [entityRefField]: undefined,
        ...blankTargets(options),
      },
      reset: true,
    };
  }

  const ref = incoming[entityRefField];
  if (ref !== previous[entityRefField] && whenMatches(options, incoming)) {
    return {
      next: { ...incoming, ...blankTargets(options) },
      load: typeof ref === 'string' && ref !== '' ? ref : undefined,
      reset: true,
    };
  }

  return { next: incoming, reset: false };
}

export function fillValues(
  entity: Entity,
  options: CatalogEntityPrefillOptions,
): StepData {
  return Object.fromEntries(
    Object.entries(options.fill).map(([target, path]) => [
      target,
      toFieldValue(getEntityValue(entity, path)),
    ]),
  );
}
