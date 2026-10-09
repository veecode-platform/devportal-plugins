---
'devportal-marketplace-backend': patch
---

Store the YAML typed on a plugin's install and edit page. `POST /plugin/:namespace/:name/configuration` ignored it and stored the `pluginConfig` already saved or the package's first `appConfigExamples` entry. The example is now added only to a package entry that comes without `pluginConfig`.
