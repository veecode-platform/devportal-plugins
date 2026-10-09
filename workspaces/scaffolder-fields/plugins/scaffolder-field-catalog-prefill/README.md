# @veecode-platform/backstage-plugin-scaffolder-field-catalog-prefill

A scaffolder field extension, `CatalogEntityPrefill`, that fills the properties of a
template step from a catalog entity the user picks in the same step.

Use it for templates that update or remove something that already exists in the
catalog: the user selects the entity, the form shows its current values, and the
template receives them as ordinary flat strings.

## How it works

You apply `ui:field: CatalogEntityPrefill` to the **root object of a step**, not to one
property. The field renders the step through RJSF's default `ObjectField`, so every
other field, other field extensions such as `EntityPicker` or `OwnedEntityPicker`, and
`dependencies`/`oneOf` keep working. The value it controls is the flat object of the
step, so the REST contract (`POST /api/scaffolder/v2/tasks` with flat `values`) does not
change.

- The source is the Backstage catalog (`catalogApiRef`, `getEntityByRef`). It does not
  fetch URLs.
- When the property named by `entityRefField` changes and `when` matches, every `fill`
  target is cleared at once, the entity is loaded, and all targets are set in one change.
  A path that is not in the entity sets the target to an empty string.
- A new selection always reloads: edits made while the previous entity was selected are
  discarded. Edits made after the load are kept until the selection changes again. A late
  response for an earlier selection never overwrites the current one.
- When a property listed in `when` changes (for example the operation), the entity ref and
  the `fill` targets are cleared.
- While the entity loads, the targets are read-only and a status line shows under the
  form. After a load error, an alert line shows and the targets stay empty; selecting
  another entity recovers.

## Options

Set them in `ui:options` of the step:

| Option           | Required | Meaning                                                                                                                              |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `entityRefField` | yes      | Property of the step that holds the selected entity ref.                                                                             |
| `fill`           | yes      | Map of form property to a path into the entity. Use brackets for keys with dots or slashes: `metadata.annotations['example.com/x']`. |
| `when`           | no       | Only load when every listed property has the value, or one of the values, given. For example `operation: [update, remove]`.          |
| `readonlyWhen`   | no       | Mark the `fill` targets read-only when every listed property matches.                                                                |
| `messages`       | no       | Overrides for the field's own texts: `loading` and `error`.                                                                          |

Values that are not strings are written as text: numbers and booleans with `String`,
objects and arrays as JSON.

## Example template

The step has an `operation`; update and remove show an entity picker and the fields to
fill, add shows plain fields. The same template is in
[`examples/template/template.yaml`](../../examples/template/template.yaml) with its
fixture entities.

```yaml
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: manage-skill
  title: Manage a skill
spec:
  owner: team-a
  type: example
  parameters:
    - title: Skill
      required:
        - operation
      ui:field: CatalogEntityPrefill
      ui:options:
        entityRefField: skill
        fill:
          description: metadata.description
          instructions: spec.instructions
          client: metadata.annotations['example.com/client']
        when:
          operation: [update, remove]
        readonlyWhen:
          operation: remove
        messages:
          loading: Loading the skill…
      properties:
        operation:
          title: Operation
          type: string
          enum: [add, update, remove]
          default: add
      dependencies:
        operation:
          oneOf:
            - properties:
                operation:
                  enum: [add]
                name:
                  title: Name
                  type: string
                description:
                  title: Description
                  type: string
                  ui:widget: textarea
                instructions:
                  title: Instructions
                  type: string
                  ui:widget: textarea
                client:
                  title: Client
                  type: string
              required: [name]
            - properties:
                operation:
                  enum: [update, remove]
                skill:
                  title: Skill
                  type: string
                  ui:field: EntityPicker
                  ui:options:
                    defaultKind: Resource
                    catalogFilter:
                      - kind: Resource
                        spec.type: skill
                description:
                  title: Description
                  type: string
                  ui:widget: textarea
                instructions:
                  title: Instructions
                  type: string
                  ui:widget: textarea
                client:
                  title: Client
                  type: string
              required: [skill]
  steps:
    - id: log
      name: Log the request
      action: debug:log
      input:
        message: '${{ parameters.operation }} ${{ parameters.skill }}'
```

## Installation

### Dynamic plugin (VeeCode DevPortal / RHDH)

Add the exported package to `dynamic-plugins.yaml`. The scalprum name is
`veecode-platform.backstage-plugin-scaffolder-field-catalog-prefill`:

```yaml
plugins:
  - package: ./dynamic-plugins/dist/veecode-platform-backstage-plugin-scaffolder-field-catalog-prefill-dynamic
    disabled: false
    pluginConfig:
      dynamicPlugins:
        frontend:
          veecode-platform.backstage-plugin-scaffolder-field-catalog-prefill:
            scaffolderFieldExtensions:
              - importName: CatalogEntityPrefillExtension
            translationResources:
              - importName: catalogEntityPrefillTranslations
                ref: catalogEntityPrefillTranslationRef
```

`translationResources` is only needed for the Brazilian Portuguese texts.

### Static app

```tsx
import { ScaffolderFieldExtensions } from '@backstage/plugin-scaffolder';
import {
  CatalogEntityPrefillExtension,
  catalogEntityPrefillTranslations,
} from '@veecode-platform/backstage-plugin-scaffolder-field-catalog-prefill';

<Route path="/create" element={<ScaffolderPage />}>
  <ScaffolderFieldExtensions>
    <CatalogEntityPrefillExtension />
  </ScaffolderFieldExtensions>
</Route>;
```

Pass `catalogEntityPrefillTranslations` in `createApp`'s translation resources, and list
`pt-BR` among the available languages, to ship the Portuguese texts.

## Texts

The field's own texts are English by default and come through Backstage's translation
API. A `pt-BR` translation ships with the package. `ui:options.messages` overrides both.

## Holding the step

While the entity loads, and after a load fails, the step cannot be submitted: the field
marks a hidden input invalid, so the browser stops the Next and Review buttons and shows
the status message. The scaffolder does not run a field's `validation` hook for the root
object of a step, which is why the field uses the browser's own form validation. See
`PDR-004` in the workspace [`DECISIONS.md`](../../DECISIONS.md).

## Exports

| Export                               | Description                                  |
| ------------------------------------ | -------------------------------------------- |
| `CatalogEntityPrefillExtension`      | The scaffolder field extension.              |
| `catalogEntityPrefillTranslations`   | Translation resource with the `pt-BR` texts. |
| `catalogEntityPrefillTranslationRef` | Translation ref of the field's texts.        |

## License

Apache-2.0
