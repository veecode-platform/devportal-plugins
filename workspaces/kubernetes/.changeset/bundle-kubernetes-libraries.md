---
'@veecode-platform/plugin-kubernetes-backend-module-getsecret': patch
---

Bundle `@backstage/plugin-kubernetes-backend`, `-node` and `-common` into the dynamic export instead of expecting the portal to provide them. DevPortal 3.x ships the kubernetes backend as a dynamic plugin with those libraries in its own tree, so the module failed to load with `Cannot find module '@backstage/plugin-kubernetes-node'`. The workspace pins the embedded kubernetes backend and node to the Backstage 1.52.0 release versions the portal runs.
