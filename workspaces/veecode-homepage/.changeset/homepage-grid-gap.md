---
'@veecode-platform/plugin-veecode-homepage': patch
---

Keep the home page spacing when another dynamic plugin changes the MUI class prefix. The home content is now laid out with CSS grid and `gap` instead of nested `Grid spacing`. Grid spacing pads its items through a `.MuiGrid-item` selector built when MUI first loads; when a plugin later sets the `v5-` class prefix on the MUI copy the host shares, the items render as `v5-MuiGrid-item`, the padding never applies, and the cards slide under the header and off the left edge.
