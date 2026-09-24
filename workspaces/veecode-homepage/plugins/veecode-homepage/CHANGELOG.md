# @veecode-platform/plugin-veecode-homepage

## 1.0.3

### Patch Changes

- 251b57e: Record visits on plain-HTTP origins. The plugin now installs a `crypto.randomUUID` fallback, which `@backstage/plugin-home` needs to save a visit and which browsers expose only in secure contexts.
