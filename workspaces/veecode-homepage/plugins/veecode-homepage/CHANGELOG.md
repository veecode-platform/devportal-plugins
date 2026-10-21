# @veecode-platform/plugin-veecode-homepage

## 1.0.4

### Patch Changes

- 18a85b2: Keep the home page spacing when another dynamic plugin changes the MUI class prefix. The home content is now laid out with CSS grid and `gap` instead of nested `Grid spacing`. Grid spacing pads its items through a `.MuiGrid-item` selector built when MUI first loads; when a plugin later sets the `v5-` class prefix on the MUI copy the host shares, the items render as `v5-MuiGrid-item`, the padding never applies, and the cards slide under the header and off the left edge.

## 1.0.3

### Patch Changes

- 251b57e: Record visits on plain-HTTP origins. The plugin now installs a `crypto.randomUUID` fallback, which `@backstage/plugin-home` needs to save a visit and which browsers expose only in secure contexts.
