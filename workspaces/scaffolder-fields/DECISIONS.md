# Workspace decisions

Plugin decision records (PDR) for the `scaffolder-fields` workspace.

## PDR-001: The catalog is the only source of prefill data

**Date:** 2026-10
**Status:** Accepted

`CatalogEntityPrefill` reads one entity with `catalogApiRef.getEntityByRef` and nothing
else. It does not fetch arbitrary URLs.

**Rationale:** the catalog is already authenticated, permission-aware and available to
every portal, so the field adds no backend, no proxy configuration and no new way to
reach a host from the browser. A template that needs another source can add a backend
action or a catalog entity that carries the data.

## PDR-002: The field takes the root object of a step, to keep the contract flat

**Date:** 2026-10
**Status:** Accepted

The field is applied to the root object of a template step, not to one property. It
renders the step through RJSF's default `ObjectField`, passing its own `onChange`, and
controls the flat object of the step.

**Rationale:** a property-level field can only write its own value, so filling sibling
properties would need either a nested object or a second mechanism. With the root object
the parameters stay flat strings, `POST /api/scaffolder/v2/tasks` receives the same flat
`values` as for any other template, other field extensions (`EntityPicker`,
`OwnedEntityPicker`) and `dependencies`/`oneOf` keep working inside the step, and a
caller using the REST or MCP interface sees no difference. The Backstage 1.52 stepper
was checked with `dependencies.oneOf` in Jest
(`CatalogEntityPrefill.stepper.test.tsx`) and in the dev shell (`e2e-tests/`).

**Consequence:** see PDR-004.

## PDR-003: A new selection always reloads the fields

**Date:** 2026-10
**Status:** Accepted

When the entity ref changes, the filled properties are cleared at once and set again in
one change when the entity arrives. Edits made while the previous entity was selected are
discarded; edits made after the load are kept until the selection changes again. A
response that belongs to an earlier selection is dropped.

**Rationale:** the values describe one entity. Merging the new entity into the old one
would leave a mix nobody chose, and asking whether to keep the edits adds a prompt to a
form that has no place for one. Clearing first also means the form never shows the old
entity next to the new ref while the request is in flight.

## PDR-004: Blocking the step while the entity loads is open

**Date:** 2026-10
**Status:** Open

The field registers a `validation` hook that reports an error while the entity is
loading or after a load failure, and shows a status or alert line under the form. On
Backstage 1.52 the hook does not run for a field on the root object of a step:
`createAsyncValidators` (`@backstage/plugin-scaffolder-react`) walks the properties of
the step's data and never inspects the step itself. In the dev shell the Review button
advances while the status line is still visible. A decision is needed on how the step
is held: for example a native form-validity guard rendered by the field, or a field
placed on a nested object property.
