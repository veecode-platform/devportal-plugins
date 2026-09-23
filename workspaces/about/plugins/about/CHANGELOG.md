# @veecode-platform/backstage-plugin-about

## 1.2.1

### Patch Changes

- 1f3fb05: Declare `@backstage/errors` as a direct dependency; it was previously resolved through hoisting.

## 1.2.0

### Minor Changes

- 0cb6b86: Ship through the export overlay as OCI images instead of npm (plugins ADR-0010), built on the Backstage 1.52.0 host line. 1.1.0 was the last npm release; its source version had not been committed back, so this change starts from 1.1.0.
