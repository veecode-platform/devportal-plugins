# @veecode-platform/plugin-kubernetes-backend-module-getsecret

A Backstage backend module that extends the Kubernetes plugin with flexible authentication strategies. This module allows you to retrieve Kubernetes authentication tokens from multiple sources: Kubernetes Secrets, environment variables, or files.

- **Multiple Token Sources**: Fetch authentication tokens from Kubernetes Secrets, environment variables or files
- **Fallback Support**: Falls back to standard ServiceAccount authentication when custom auth is not configured
- **Per-Cluster Configuration**: Configure different token sources for each Kubernetes cluster
- **Detailed Logging**: Comprehensive debug and error logging for troubleshooting

## Features

The module provides an alternate Kubernetes authentication module that extends the regular Kubernetes `serviceAccount` token connection method, by allowing its value to be fetched in runtime in several ways.

- `secret`: fetches the token from a Kubernetes secret
- `env`: fetches the token from an environment variable
- `file`: fetches the token from a file

### What is hard to understand

When using the `secret` source, this plugin will fetch secrets from a cluster in runtime (usually the one itself is running), in order to get a serviceAccount token to authenticate against **another cluster** (the one listed in `app-config.yaml`).

In short: you are reading a secret from your current cluster containing a token that allows Backstage to connect to the remote cluster listed in `app-config.yaml`.

## Installation

This plugin supports both **static linking** (traditional Backstage) and **dynamic plugin loading** (VeeCode DevPortal and Red Hat Developer Hub).

### Static Installation

Install the package in your Backstage backend:

```bash
yarn workspace backend add @veecode-platform/plugin-kubernetes-backend-module-getsecret
```

Add the module to your backend in `packages/backend/src/index.ts`:

```typescript
const backend = createBackend();
// ... other plugins
backend.add(import('@veecode-platform/plugin-kubernetes-backend-module-getsecret'));
```

### Dynamic Installation

Dynamic plugin installation is available for both **VeeCode DevPortal** and **Red Hat Developer Hub (RHDH)**.

#### VeeCode DevPortal

The plugin is **bundled in the file system** and ready to use. Enable it in `dynamic-plugins.yaml`:

```yaml
plugins:
  - package: ./dynamic-plugins/dist/veecode-platform-plugin-kubernetes-backend-module-getsecret-dynamic
    disabled: false
```

#### Red Hat Developer Hub (RHDH)

RHDH can **download the plugin at runtime** using NPM. Add it to `dynamic-plugins.yaml`:

```yaml
plugins:
  - package: '@veecode-platform/plugin-kubernetes-backend-module-getsecret-dynamic@<version>'
    disabled: false
    integrity: sha512-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**Tip**: Check the [npm registry](https://www.npmjs.com/package/@veecode-platform/plugin-kubernetes-backend-module-getsecret-dynamic) for the latest version and integrity hash.

## Configuration

### Basic Setup

Configure your Kubernetes clusters in `app-config.yaml` with `authMetadata` to specify the token source:

```yaml
kubernetes:
  serviceLocatorMethod:
    type: 'singleTenant'
  clusterLocatorMethods:
    - type: 'config'
      clusters:
        - name: my-cluster
          url: https://somecluster.somewhere.com
          authProvider: 'serviceAccount'
          skipTLSVerify: false
          caData: ${K8S_CA_DATA}
          authMetadata:
            source: secret        # Options: 'secret', 'env', 'file'
            secretName: my-token  # Name meaning depends on source (see below)
            namespace: default    # Required for 'secret' source only
            tokenName: token      # Optional, defaults to 'token'
```

### How It Works

1. **Custom Strategy**: When a cluster has `authMetadata.secretName` configured, the custom authentication strategy is used
2. **Token Retrieval**: Based on the `source` field, the token is fetched from:
   - Kubernetes Secret (with automatic base64 decoding)
   - Environment variable
   - File (with automatic whitespace trimming)
3. **Fallback**: If `authMetadata.secretName` is not set, it falls back to the standard Backstage ServiceAccount authentication

### Option 1: Kubernetes Secret (Recommended)

Retrieve tokens from Kubernetes Secrets in the cluster where Backstage is running:

```yaml
authMetadata:
  source: secret
  secretName: mysecret
  namespace: default
  tokenName: token  # Optional, defaults to 'token'
```

**Create the secret:**

```bash
# From a service account token
kubectl create secret generic mysecret \
  --from-literal=token="eyJhbGciOiJSUzI1NiIsImtp..." \
  --namespace=default

# Or from a file
kubectl create secret generic mysecret \
  --from-file=token=./token.txt \
  --namespace=default
```

Please notice that the plugin connection when reading the secret is usually to the kubernetes cluster where backstage itself is running, not to the cluster the config refers to.

### Option 2: Environment Variable

Retrieve tokens from environment variables:

```yaml
authMetadata:
  source: env
  secretName: K8S_CLUSTER_TOKEN  # Environment variable name
```

**Set the environment variable:**

```bash
export K8S_CLUSTER_TOKEN="eyJhbGciOiJSUzI1NiIsImtp..."
```

Or in your deployment:

```yaml
env:
  - name: K8S_CLUSTER_TOKEN
    valueFrom:
      secretKeyRef:
        name: cluster-credentials
        key: token
```

### Option 3: File

Retrieve tokens from files on the filesystem:

```yaml
authMetadata:
  source: file
  secretName: /var/run/secrets/kubernetes.io/serviceaccount/token
```

**Note:** The file path must be accessible by the Backstage backend process.

## Additional Notes

### Secret fetching

Please understand there is a *kube config resolution order* in place. When fetching secrets, the plugin uses the following code:

```typescript
const kc = new KubeConfig();
// Explicitly handle KUBECONFIG environment variable
if (process.env.KUBERNETES_SERVICE_HOST) {
  this.logger.debug(
    'VEECODE: Detected in-cluster environment, using loadFromCluster()',
  );
  kc.loadFromCluster();
} else if (process.env.KUBECONFIG) {
  this.logger.debug(`VEECODE: Loading kubeconfig from KUBECONFIG env var: ${process.env.KUBECONFIG}`);
  kc.loadFromFile(process.env.KUBECONFIG);
} else {
  this.logger.debug(`VEECODE: Loading kubeconfig from default location`);
  kc.loadFromDefault();
}
```

The `loadFromDefault()` method attempts to load Kubernetes configuration in the following priority order:

1. **`KUBECONFIG` environment variable** - If set, loads configuration from the file(s) specified
2. **In-cluster configuration** - If running inside a Kubernetes pod, uses:
   - Service account token from `/var/run/secrets/kubernetes.io/serviceaccount/token`
   - Namespace from `/var/run/secrets/kubernetes.io/serviceaccount/namespace`
   - CA certificate from `/var/run/secrets/kubernetes.io/serviceaccount/ca.crt`
3. **`~/.kube/config` file** - Falls back to the default kubeconfig file in the user's home directory

**Important:** This configuration determines which cluster the plugin connects to for reading the secret source, which is probably NOT the target cluster specified in the Backstage configuration itself. In most production deployments where Backstage runs inside Kubernetes, it will use the in-cluster configuration (option 2), in which case the secrets are read from the same cluster where backstage is running.

**RBAC Requirements:**

The Backstage pod's ServiceAccount needs permission to read secrets:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: backstage-secret-reader
  namespace: default
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: backstage-secret-reader
  namespace: default
subjects:
- kind: ServiceAccount
  name: backstage
  namespace: default
roleRef:
  kind: Role
  name: backstage-secret-reader
  apiGroup: rbac.authorization.k8s.io
```

### Optional: Enable Default Auth Strategies

By default, this module replaces the default `serviceAccount` strategy, but as a side effect it also desables all other Kubernetes authentication strategies (not sure if this is expected behavior). To keep all default Backstage Kubernetes auth strategies, add this setting:

```yaml
veecode:
  kubernetes:
    addDefaultKubernetesAuthStrategies: true
```

This enables: `google`, `googleServiceAccount`, `aws`, `aks`, `azureIdentity`, `oidc`, and `localKubectlProxy`.

## Complete Configuration Example

```yaml
kubernetes:
  serviceLocatorMethod:
    type: 'singleTenant'
  clusterLocatorMethods:
    - type: 'config'
      clusters:
        # Production cluster - token from K8s secret
        - name: prod-cluster
          url: https://prod.k8s.example.com
          authProvider: 'serviceAccount'
          skipTLSVerify: false
          caData: ${PROD_CA_DATA}
          authMetadata:
            source: secret
            secretName: prod-cluster-token
            namespace: backstage
            
        # Staging cluster - token from environment
        - name: staging-cluster
          url: https://staging.k8s.example.com
          authProvider: 'serviceAccount'
          skipTLSVerify: false
          caData: ${STAGING_CA_DATA}
          authMetadata:
            source: env
            secretName: STAGING_K8S_TOKEN
            
        # Dev cluster - token from file
        - name: dev-cluster
          url: https://dev.k8s.example.com
          authProvider: 'serviceAccount'
          skipTLSVerify: false
          caData: ${DEV_CA_DATA}
          authMetadata:
            source: file
            secretName: /etc/kubernetes/dev-token.txt

veecode:
  kubernetes:
    addDefaultKubernetesAuthStrategies: false
```

## Troubleshooting

### Enable Debug Logging

Set log level to debug in `app-config.yaml`:

```yaml
backend:
  logging:
    level: debug
```

Look for `VEECODE:` prefixed log messages.

### Common Issues

#### "Secret has no data field"

- The Kubernetes secret doesn't have a `data` field or the specified `tokenName`
- Check: `kubectl get secret <name> -n <namespace> -o yaml`

#### "Failed to fetch Kubernetes secret: 403 Forbidden"

- Backstage's ServiceAccount lacks RBAC permissions to read secrets
- Apply the RBAC configuration shown above

#### "Failed to fetch Kubernetes secret: 404 Not Found"

- Secret doesn't exist in the specified namespace
- Verify: `kubectl get secret <name> -n <namespace>`

#### Authentication fails with valid token

- Check if token needs to be base64 decoded (Kubernetes secrets are auto-decoded)
- For files/env vars, ensure the token is in plain JWT format (not base64 encoded)

## License

Apache-2.0

## Support

For issues and questions:

- GitHub Issues: [veecode-platform/devportal-plugins](https://github.com/veecode-platform/devportal-plugins)
- Documentation: [Veecode Platform Docs](https://docs.veecode.platform)
