# AGENTS.md — kubernetes workspace

Agent context for this workspace. Repository-wide rules, including the shape this file follows, are in the root [`AGENTS.md`](../../AGENTS.md).

## What the plugins do

One package, and no frontend plugin of our own: the UI is the upstream `@backstage/plugin-kubernetes`, which the hosting app loads.

- `plugins/kubernetes-backend-module-getsecret` — `@veecode-platform/plugin-kubernetes-backend-module-getsecret`, role `backend-plugin-module`, `pluginId: 'kubernetes'`, `moduleId: 'veecodeauth'` (`src/module.ts`). It extends `@backstage/plugin-kubernetes-backend` through two extension points from `@backstage/plugin-kubernetes-node`:
  - `kubernetesAuthStrategyExtensionPoint`: registers `VeecodeCustomAuthStrategy` under the key `serviceAccount`, replacing the stock strategy. When a cluster's `authMetadata` names a secret, the token is fetched at runtime from a Kubernetes secret (`source: secret`, the default), an environment variable (`env`) or a file (`file`); without a secret name it defers to the inherited `ServiceAccountStrategy`. Config clusters use unprefixed keys (`secretName`, `source`, `namespace`, `tokenName`); catalog clusters use `vee.codes/kubernetes-secret-name`, `vee.codes/kubernetes-secret-source`, `vee.codes/kubernetes-secret-namespace`, `vee.codes/kubernetes-token-name`. Prefixed keys are read first.
  - `kubernetesClusterSupplierExtensionPoint`: wraps the default supplier in `VeecodeEnhancedCatalogSupplier`, which deduplicates catalog clusters by name, fills `skipTLSVerify` and `skipMetricsLookup` defaults, and merges catalog clusters with the `type: 'config'` clusters from `kubernetes.clusterLocatorMethods` (config fields win, `authMetadata` is merged, config-only clusters are appended).

`src/index.ts` has a single default export, the module, so a backend adds it with `backend.add(import('@veecode-platform/plugin-kubernetes-backend-module-getsecret'))`.

## Layout

Standard shape (see the root `AGENTS.md`), plus:

```pre
workspaces/kubernetes/
├── packages/
│   ├── app/                                   # New Frontend System host: App.tsx is createApp() from @backstage/frontend-defaults
│   │   ├── src/veecodeKubernetesAuthModule.ts # Frontend module for a 'veecodeauth' provider; not wired (see Gotchas)
│   │   ├── src/App.test.tsx
│   │   └── e2e-tests/app.test.ts              # Playwright
│   └── backend/src/index.ts                   # Adds @backstage/plugin-kubernetes-backend, then this module
├── plugins/kubernetes-backend-module-getsecret/
│   ├── src/module.ts                          # createBackendModule; both extension points; reads veecode.kubernetes.*
│   ├── src/VeecodeCustomAuthStrategy.ts       # Token from secret / env / file; kubeconfig resolution
│   ├── src/VeecodeEnhancedCatalogSupplier.ts  # Dedup, defaults, catalog + config merge
│   ├── src/addDefaultKubernetesAuthStrategies.ts  # Re-adds google, googleServiceAccount, aws, aks, azureIdentity, oidc, localKubectlProxy
│   └── README.md                              # Consumer docs: config keys, annotations, RBAC, troubleshooting
├── examples/                                  # Catalog data for local dev; clusters.yaml holds the three vkdr clusters
├── dynamic/                                   # Container harness: docker-compose.yml, dynamic-plugins.yaml, app-config.yaml, proxy-config.yaml, examples/, DYNAMIC.md
├── .vscode/launch.json                        # "Yarn Debug" and "Attach Backstage (port 9229)" mapped to the container's plugin path
├── app-config.yaml                            # Feature discovery (app.packages: all), three clusters, veecode.kubernetes flags
├── backstage.json                             # 1.49.2
├── catalog-info.yaml                          # create-app placeholder
├── Makefile                                   # Standard targets for the single plugin
├── README.md
├── AGENTS.md                                  # This file
└── CLAUDE.md
```

## Commands

Standard `yarn` and `make` targets (root `AGENTS.md`), with these differences:

| Command | Purpose |
|---------|---------|
| `yarn debug` | `backstage-cli repo start --inspect=0.0.0.0:9229`; pairs with the "Yarn Debug" launch configuration |
| `yarn test:e2e` | Playwright; `playwright.config.ts` starts `yarn start app` and `yarn start backend` unless `CI` is set |
| `make build-dynamic` | `make build`, then `npx @red-hat-developer-hub/cli@latest plugin export` in the plugin. The plugin's own `yarn export-dynamic` runs `rhdh-cli plugin export` |
| `make set-version VERSION=x.y.z` | Rewrites the single plugin `package.json`, then `yarn install` |
| `cd dynamic && docker compose up --no-log-prefix` | Container harness (see Dynamic loading) |

There is no `yarn update-backstage` script in this workspace's `package.json`, and no `replace-workspace` target: the plugin has no `workspace:` dependencies. Only `packages/backend`, which is not published, depends on it with `workspace:^`.

## Architecture

### Backend module (`plugins/kubernetes-backend-module-getsecret/src/module.ts`)

```typescript
export const kubernetesVeecodeModule = createBackendModule({
  pluginId: 'kubernetes',
  moduleId: 'veecodeauth',
  register(reg) {
    reg.registerInit({
      deps: { logger, config: coreServices.rootConfig, authStrategy: kubernetesAuthStrategyExtensionPoint, clusterSupplier: kubernetesClusterSupplierExtensionPoint },
      async init({ logger, config, authStrategy, clusterSupplier }) {
        if (config.getOptionalBoolean('veecode.kubernetes.addDefaultKubernetesAuthStrategies') === true) addDefaultKubernetesAuthStrategies(authStrategy, config, logger);
        authStrategy.addAuthStrategy('serviceAccount', new VeecodeCustomAuthStrategy(logger, fetchSecretWithRawHttps));
        clusterSupplier.addClusterSupplier(async ({ getDefault }) => new VeecodeEnhancedCatalogSupplier(await getDefault(), config, logger));
      },
    });
  },
});
```

Config keys, all under `veecode.kubernetes` and read with `getOptionalBoolean`: `addDefaultKubernetesAuthStrategies` (default `false`), `fetchSecretWithRawHttps` (`false`), `enableEnhancedCatalogSupplier` (`true`), `mergeCatalogWithConfig` (`true`), `defaultSkipTLSVerify` (`false`), `defaultSkipMetricsLookup` (`false`), `requireAuthMetadata` (`false`, warns only). There is no `config.d.ts` and no `configSchema`, so these keys are not schema-validated.

### Secret fetching (`VeecodeCustomAuthStrategy.getTokenFromSecret`)

The kubeconfig is resolved in this order: `KUBERNETES_SERVICE_HOST` set → `loadFromCluster()`; `KUBECONFIG` set → `loadFromFile(KUBECONFIG)`; otherwise `loadFromDefault()`. The secret is read with `CoreV1Api.readNamespacedSecret` (`@kubernetes/client-node`) and base64-decoded. That connection goes to the cluster the backend runs in, not to the target cluster; the fetched token is then used against the target. `fetchSecretWithRawHttps: true` swaps in a hand-written `https.request` (see Gotchas).

### Hosting app

- `packages/app/src/App.tsx` uses the New Frontend System: `createApp()` from `@backstage/frontend-defaults` with no explicit features, exported as `app.createRoot()`; `index.tsx` renders that element directly. `app-config.yaml` enables feature discovery (`app.packages: all`) and configures `entity-content:kubernetes/kubernetes` (`filter: 'kind:component,resource'`) plus `nav-item:catalog`, `nav-item:catalog/groups` and `nav-item:setting` under `app.extensions`. Exploration notes on this migration live in the planning repository `veecode-platform/devportal-plugins-parent` under `docs/planning/research/`.
- `packages/backend/src/index.ts` adds `@backstage/plugin-kubernetes-backend` and then this module (static loading). Dynamic loading mounts `dist-dynamic/` into the container instead.

## Testing

```pre
packages/app/src/App.test.tsx          # Renders the App element with an APP_CONFIG env
packages/app/e2e-tests/app.test.ts     # Playwright: Enter button, then "My Company Catalog"
```

The plugin has no tests; `@backstage/backend-test-utils` is already a devDependency. When adding them, follow dummy's backend patterns (`startTestBackend` for integration, a mocked dependency for unit tests). Run `yarn test:all` from the workspace or `yarn test --watchAll=false` from the plugin.

## Dynamic loading

`dynamic/docker-compose.yml` starts `veecode/devportal:latest` (ports 7007 and 9229) and mounts:

- `dynamic/app-config.yaml` → `/app/app-config.local.yaml` (cluster URLs from `${TUNNEL_URL}`, only the `config` locator, catalog locations under `/app/examples/`)
- `dynamic/dynamic-plugins.yaml` → `/app/dynamic-plugins.yaml` (includes `dynamic-plugins.default.yaml`; enables `backstage-plugin-kubernetes-dynamic` and this module)
- `dynamic/examples` → `/app/examples`
- `plugins/kubernetes-backend-module-getsecret/dist-dynamic` → `/app/dynamic-plugins/dist/veecode-platform-plugin-kubernetes-backend-module-getsecret-dynamic`
- `dynamic/proxy-config.yaml` → `/opt/app-root/src/.kube/config` (read-only)

A second service, `kubectl-cli` (`alpine/kubectl`), shares the DevPortal network namespace, mounts the host's `~/.kube` read-only, rewrites `0.0.0.0` to `kubernetes.default` in the server URL and runs `kubectl proxy -p 8001`. `proxy-config.yaml` is a kubeconfig pointing at `http://127.0.0.1:8001` with an empty token, so the module's secret fetch inside the container goes through that proxy with the host's credentials; `extra_hosts` maps `kubernetes.default` to the host gateway. The shell supplies `TUNNEL_URL`, `K8S_SA_TOKEN` and `K8S_CA_DATA`; the file sets `VEECODE_PROFILE=local`, `LOG_LEVEL=debug` and `DEBUG_PORT=9229`.

```sh
make build-dynamic
cd dynamic && docker compose up --no-log-prefix
```

`dynamic/DYNAMIC.md` walks through the cluster, token and secret setup. The mount is a build output, so code changes need `make build-dynamic` again and a container restart.

## Mocks and external dependencies

- External dependency: a Kubernetes cluster reachable from the backend. The `README.md` quick start creates one with `vkdr` (`vkdr infra start --api-port 9000`, `vkdr infra createToken --silent`, `vkdr infra getca --silent`), matching the `https://127.0.0.1:9000` URLs and the `K8S_SA_TOKEN` / `K8S_CA_DATA` variables in `app-config.yaml`, then stores the token in a `mysecret` secret and installs workloads labelled `vee.codes/cluster=<name>`, which the `backstage.io/kubernetes-label-selector` annotations in `examples/clusters.yaml` select.
- No mocks and no `dev/` entry point: `yarn start` needs that cluster.
- `examples/clusters.yaml` shows the three shapes: `vkdr-config-cluster` (static `serviceAccountToken` in config), `vkdr-catalog-cluster` (token from a secret through config `authMetadata`) and `vkdr-yet-another-cluster` (fully catalog-defined: `kubernetes.io/*` connection annotations plus `vee.codes/kubernetes-secret-*`).

## Gotchas

- The strategy is registered under `serviceAccount`; `veecodeauth` is only the `moduleId`. Clusters keep `authProvider: 'serviceAccount'`. Registering it drops the other stock strategies (`addDefaultKubernetesAuthStrategies.ts` explains why); set `veecode.kubernetes.addDefaultKubernetesAuthStrategies: true` to re-add them.
- `fetchSecretWithRawHttps: true` sets `rejectUnauthorized: false` and `servername: 'localhost'` and rewrites `0.0.0.0` to `localhost`. It is a diagnostic path, not a hardened one.
- `packages/app/src/veecodeKubernetesAuthModule.ts` is not imported by `App.tsx` (the `features` array is commented out), and it imports `@backstage/frontend-plugin-api` and `@backstage/plugin-kubernetes-react`, neither declared in `packages/app/package.json`.
- `backstage.json` says 1.49.2 while the DevPortal host declares 1.52.0 (planning repository ADR-0004). Moving this workspace to the host line follows dummy (M6 in the planning repository); do not bump ad hoc, and note there is no `yarn update-backstage` script here.
- `dynamic/DYNAMIC.md` says `make build-kubernetes-dynamic` from the repository root; that target exists in neither Makefile. Use `make build-dynamic` from `workspaces/kubernetes/`. `README.md` mentions `make bump-version` and `KUBERNETES_VERSION`, which do not exist either; the variable is `VERSION`.
- The Makefile default `VERSION` and the plugin `package.json` version differ. `make set-version VERSION=x.y.z` writes the value you pass.
- The exporter is unpinned: the Makefile runs `@red-hat-developer-hub/cli@latest` and the plugin's devDependency is `latest`.
- `dynamic/examples/` is not a copy of `examples/`: `clusters.yaml` comments out `kubernetes.io/api-server` for `vkdr-yet-another-cluster`, `entities.yaml` is shorter and there is no `template/`.
- `catalog-info.yaml` is the `create-app` placeholder (`owner: john@example.com`). Its fate is decided by standard 01 in the planning repository; do not fill it in ad hoc.

## Decisions

No `DECISIONS.md` in this workspace. If one is added, entries are plugin decision records (`PDR-NNN`), cited as `kubernetes PDR-NNN`. Cross-workspace decisions are `plugins ADR-NNNN` in the planning repository `veecode-platform/devportal-plugins-parent`.
