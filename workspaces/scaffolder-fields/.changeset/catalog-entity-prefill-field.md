---
'@veecode-platform/backstage-plugin-scaffolder-field-catalog-prefill': minor
---

Add the `CatalogEntityPrefill` scaffolder field. Applied to the root object of a template step, it fills form properties from a catalog entity the user selects in the same step, so update and remove templates start from the current values and keep flat string parameters. It supports `when` and `readonlyWhen` conditions, reloads on every new selection, drops late responses and ships English and Brazilian Portuguese texts.
