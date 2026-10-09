---
'devportal-marketplace-frontend': patch
'devportal-marketplace-backend': patch
---

Reject YAML with a syntax error when a plugin is installed or its configuration is saved. The install page no longer sends it and shows the line and column of the first error; `POST /plugin/:namespace/:name/configuration` answers 400 with the same position. Before, the page re-serialized whatever the parser recovered, so a mis-indented key, an unclosed quote or a tab could be stored as a different configuration than the one typed.
