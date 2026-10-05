---
'devportal-marketplace-frontend': patch
---

Poll the pending-changes query while Marketplace cards are mounted so the Pending install and Pending removal chips appear once the backend exposes the new row. Stop confirm-dialog clicks from bubbling to the card so confirming an install or uninstall no longer opens the plugin details drawer.
