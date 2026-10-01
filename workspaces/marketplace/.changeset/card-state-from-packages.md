---
'devportal-marketplace-frontend': minor
---

Derive a plugin card's installed state from the statuses of its Package entities, which follow a restart at once, instead of the Plugin entity's `installStatus`, which lags behind. A default plugin that was uninstalled now shows "Install" instead of "Built-in" and "Disable". "Built-in" stays for a loaded plugin that has no packages. The card now fetches the plugin's packages for every card, not only after a failed install.
