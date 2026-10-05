# devportal-marketplace-frontend

## 0.3.1

### Patch Changes

- 2b2c521: Poll the pending-changes query while Marketplace cards are mounted so the Pending install and Pending removal chips appear once the backend exposes the new row. Stop confirm-dialog clicks from bubbling to the card so confirming an install or uninstall no longer opens the plugin details drawer.

## 0.3.0

### Minor Changes

- 9ec789d: Derive a plugin card's installed state from the statuses of its Package entities, which follow a restart at once, instead of the Plugin entity's `installStatus`, which lags behind. A default plugin that was uninstalled now shows "Install" instead of "Built-in" and "Disable". "Built-in" stays for a loaded plugin that has no packages. The card now fetches the plugin's packages for every card, not only after a failed install.

## 0.2.0

### Minor Changes

- 0df26c6: Show a red "Failed to load" chip on the card of a plugin whose package is listed in the pending-changes `failedInstalls` field, and keep its Uninstall action. The card reads a response without that field as having no failed installs.
