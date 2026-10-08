import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { FieldExtensionComponentProps } from '@backstage/plugin-scaffolder-react';
import {
  CatalogEntityPrefillOptions,
  readonlyMatches,
  readOptions,
  StepData,
} from '../../lib/options';
import { applyChange, fillValues } from '../../lib/prefill';
import { catalogEntityPrefillTranslationRef } from '../../translations';

type LoadState = 'idle' | 'loading' | 'error';

type ChangeHandler = (data: StepData, ...rest: unknown[]) => void;

const VISUALLY_HIDDEN = {
  position: 'absolute',
  left: 0,
  bottom: 0,
  width: 1,
  height: 1,
  padding: 0,
  border: 0,
  opacity: 0,
  overflow: 'hidden',
} as const;

/**
 * Field for the root object of a template step. It renders the step through
 * the default ObjectField, so every other field keeps working, and fills the
 * configured properties from a catalog entity when the entity ref changes.
 */
export function CatalogEntityPrefill(
  props: FieldExtensionComponentProps<StepData, CatalogEntityPrefillOptions>,
) {
  const { registry, uiSchema } = props;
  const options = readOptions(uiSchema['ui:options']);
  const catalogApi = useApi(catalogApiRef);
  const { t } = useTranslationRef(catalogEntityPrefillTranslationRef);
  const onChange = props.onChange as ChangeHandler;

  const data = props.formData ?? {};
  // A load finishes long after the render that started it, so it reads the
  // latest data and options from here instead of from its own closure.
  const latest = useRef({ data, options, onChange, t });
  latest.current = { data, options, onChange, t };
  const [state, setState] = useState<LoadState>('idle');
  const request = useRef(0);

  const messageFor = (kind: 'loading' | 'error') =>
    latest.current.options.messages?.[kind] ??
    latest.current.t(`status.${kind}`);

  const cancelLoad = useCallback(() => {
    request.current += 1;
  }, []);

  useEffect(() => cancelLoad, [cancelLoad]);

  const load = async (ref: string) => {
    const id = request.current;
    setState('loading');

    let values: StepData | undefined;
    try {
      const entity = await catalogApi.getEntityByRef(ref);
      if (entity) values = fillValues(entity, latest.current.options);
    } catch {
      values = undefined;
    }
    if (id !== request.current) return;

    if (!values) {
      setState('error');
      return;
    }
    const next = { ...latest.current.data, ...values };
    latest.current.data = next;
    latest.current.onChange(next);
    setState('idle');
  };

  const handleChange: ChangeHandler = (incoming, ...rest) => {
    const transition = applyChange(latest.current.data, incoming, options);
    latest.current.data = transition.next;
    if (transition.reset) {
      cancelLoad();
      setState('idle');
    }
    onChange(transition.next, ...rest);
    if (transition.load) load(transition.load);
  };

  const { 'ui:field': _field, ...objectUiSchema } = uiSchema;
  if (state === 'loading' || readonlyMatches(options, data)) {
    for (const target of Object.keys(options.fill)) {
      objectUiSchema[target] = {
        ...objectUiSchema[target],
        'ui:readonly': true,
      };
    }
  }

  const { ObjectField } = registry.fields;
  return (
    <>
      <ObjectField
        {...props}
        uiSchema={objectUiSchema}
        onChange={handleChange as never}
      />
      {state !== 'idle' && (
        <div style={{ position: 'relative' }}>
          <p role={state === 'loading' ? 'status' : 'alert'}>
            {messageFor(state)}
          </p>
          {/* The scaffolder does not run a field's validation hook for the
              root object of a step, so the field holds the step with the
              browser's own form validation: this invalid input stops the
              stepper's submit button until the entity has loaded. */}
          <input
            ref={input => input?.setCustomValidity(messageFor(state))}
            aria-label={messageFor(state)}
            tabIndex={-1}
            style={VISUALLY_HIDDEN}
          />
        </div>
      )}
    </>
  );
}
