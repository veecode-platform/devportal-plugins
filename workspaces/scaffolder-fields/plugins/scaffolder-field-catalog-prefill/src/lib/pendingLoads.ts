import { CustomFieldValidator } from '@backstage/plugin-scaffolder-react';
import {
  CatalogEntityPrefillOptions,
  readOptions,
  StepData,
  whenMatches,
} from './options';

interface PendingLoad {
  kind: 'loading' | 'error';
  message: string;
}

// The scaffolder runs a field's `validation` hook outside React, so the
// component publishes the state of each entity ref it is loading here.
const pendingLoads = new Map<string, PendingLoad>();

export const pendingLoadStore = {
  set: (ref: string, load: PendingLoad) => void pendingLoads.set(ref, load),
  clear: (ref: string) => void pendingLoads.delete(ref),
};

export const catalogEntityPrefillValidation: CustomFieldValidator<
  StepData,
  CatalogEntityPrefillOptions
> = (data, field, context) => {
  const options = readOptions(context.uiSchema?.['ui:options']);
  const ref = data?.[options.entityRefField];
  if (typeof ref !== 'string' || !whenMatches(options, data)) return;
  const pending = pendingLoads.get(ref);
  if (pending) field.addError(pending.message);
};
