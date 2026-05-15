# @veecode-platform/plugin-kubernetes-backend-module-getsecret

A Backstage backend module that extends the Kubernetes plugin with a more flexible authentication strategy and allows clusters to be totally defined by the catalog (i.e. no need to change `app-config` to add a new cluster).

## Features (authentication)

The module provides an alternate Kubernetes authentication module that extends the regular Kubernetes `serviceAccount` token connection method, by allowing its value to be fetched in runtime in several ways. **This way a cluster can have its access token mantained outside the `app-config` file.**

A token can be obtained in runtime from the `authMetadata` field:

- `secret`: fetches the token from a Kubernetes secret
- `env`: fetches the token from an environment variable
- `file`: fetches the token from a file

Example:

```yaml
kubernetes:
  clusterLocatorMethods:
    - type: 'config'
      clusters:
        - name: my-cluster
          url: https://somecluster.somewhere.com
          authProvider: 'serviceAccount'
          # ...
          authMetadata:
            source: file            # Options: 'secret', 'env', 'file'
            secretName: /some/path  # Name contains the file path
```

These features extend the original behavior of the standard core `kubernetes` plugin authentication:

- **Multiple Token Sources**: Fetch authentication tokens from Kubernetes Secrets, environment variables or files
- **Fallback Support**: Falls back to standard ServiceAccount authentication when custom auth is not configured
- **Per-Cluster Configuration**: Configure different token sources for each Kubernetes cluster
- **Detailed Logging**: Comprehensive debug and error logging for troubleshooting
- **Merged Configuration**: Clusters can be defined partially in both ways ("config" and "catalog")

## Features (catalog)

The module also provides a custom cluster locator that enhances the default catalog-based cluster discovery with additional features, allowing clusters to define authentication from annotations. When used together, a cluster can be completely defined in the catalog (without any `app-config` entry).

### Architecture

```text
┌─────────────────────────────────────────┐
│   Backstage Kubernetes Plugin           │
└───────────────┬─────────────────────────┘
                │
                │ uses
                ▼
┌─────────────────────────────────────────┐
│  VeecodeEnhancedCatalogSupplier         │
│  (wraps default catalog supplier)       │
└───────────────┬─────────────────────────┘
                │
                │ delegates to
                ▼
┌─────────────────────────────────────────┐
│  Default Catalog Cluster Locator        │
│  (queries catalog for Resource entities)│
└─────────────────────────────────────────┘
                │
                │ queries
                ▼
┌─────────────────────────────────────────┐
│  Backstage Catalog                      │
│  (Resource entities)                    │
└─────────────────────────────────────────┘
```

### Benefits

1. **Flexibility**: Enhance cluster details without modifying catalog entities
2. **Validation**: Catch configuration issues early with custom validation
3. **Defaults**: Apply sensible defaults to reduce catalog entity verbosity
4. **Unified View**: Combine multiple cluster sources seamlessly
5. **Custom Metadata**: Add Veecode-specific fields to clusters

Example:

```yaml
apiVersion: backstage.io/v1alpha1
kind: Resource
metadata:
  name: vkdr-yet-another-cluster
  annotations:
    # the annotation below works only in singleTenant
    backstage.io/kubernetes-cluster: vkdr-yet-another-cluster
    # Required for catalog cluster locator - uses kubernetes.io/ prefix
    kubernetes.io/api-server: 'https://127.0.0.1:9000'
    kubernetes.io/auth-provider: serviceAccount
    kubernetes.io/skip-tls-verify: 'true'
    kubernetes.io/service-account-token: IGNORE
    kubernetes.io/api-server-certificate-authority: LS0tLS1...
    # Optional: Filter resources by label
    backstage.io/kubernetes-label-selector: "vee.codes/cluster=some-cluster"
    # Custom auth metadata (using vee.codes/ prefix)
    vee.codes/kubernetes-secret-name: "mysecret"
    vee.codes/kubernetes-secret-source: "secret"  # Options: secret (k8s secret), env (env var), file (file)
    vee.codes/kubernetes-secret-namespace: "default"
spec:
  type: kubernetes-cluster
  lifecycle: experimental
  owner: group:default/admins
  system: examples
```

- **Wraps Default Catalog Locator**: Uses the standard Backstage catalog cluster discovery as a base
- **Cluster Enhancement**: Adds default values and custom metadata to clusters
- **Config Merging**: Optionally merges catalog clusters with config-based clusters
- **Validation**: Validates cluster configurations and logs warnings
- **Flexible Configuration**: Supports multiple config options for customization

## Auth Metadata Fields

| Field | Annotation | Description | Default |
|-------|------------|-------------|---------|
| `secretName` | `vee.codes/kubernetes-secret-name` | Name of the Kubernetes secret, environment variable, or file | Required |
| `source` | `vee.codes/kubernetes-secret-source` | Source type: `secret`, `env`, or `file` | `secret` |
| `namespace` | `vee.codes/kubernetes-secret-namespace` | Kubernetes namespace (only for source=secret) | `default` |
| `tokenName` | `vee.codes/kubernetes-token-name` | Key name in the secret (only for source=secret) | `token` |

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

### Config-Based Clusters

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

### Catalog-Based Clusters

For catalog-based clusters, use **prefixed annotations** with the `vee.codes/` domain prefix for the `authMetadata` fields:

```yaml
apiVersion: backstage.io/v1alpha1
kind: Resource
metadata:
  name: my-cluster
  annotations:
    # Standard Kubernetes cluster annotations
    kubernetes.io/api-server: 'https://my-cluster.example.com'
    kubernetes.io/auth-provider: serviceAccount
    kubernetes.io/skip-tls-verify: 'true'
    kubernetes.io/api-server-certificate-authority: '<base64-ca-cert>'
    
    # Backstage annotations
    backstage.io/kubernetes-cluster: my-cluster
    backstage.io/kubernetes-label-selector: "env=prod"
    
    # Veecode custom auth metadata (prefixed with vee.codes/)
    vee.codes/kubernetes-secret-name: "my-k8s-secret"
    vee.codes/kubernetes-secret-source: "secret"
    vee.codes/kubernetes-secret-namespace: "default"
    vee.codes/kubernetes-token-name: "token"
spec:
  type: kubernetes-cluster
  lifecycle: production
  owner: platform-team
```

### Source Types

#### 1. Kubernetes Secret (`source: secret`)

Fetches the token from a Kubernetes secret in the same cluster where Backstage is running:

**Config:**

```yaml
authMetadata:
  secretName: "my-k8s-secret"
  source: secret
  namespace: default
  tokenName: token
```

**Catalog:**

```yaml
vee.codes/kubernetes-secret-name: "my-k8s-secret"
vee.codes/kubernetes-secret-source: "secret"
vee.codes/kubernetes-secret-namespace: "default"
vee.codes/kubernetes-token-name: "token"
```

#### 2. Environment Variable (`source: env`)

Reads the token from an environment variable:

**Config:**

```yaml
authMetadata:
  secretName: "MY_CLUSTER_TOKEN"  # env var name
  source: env
```

**Catalog:**

```yaml
vee.codes/kubernetes-secret-name: "MY_CLUSTER_TOKEN"
vee.codes/kubernetes-secret-source: "env"
```

#### 3. File (`source: file`)

Reads the token from a file path:

**Config:**

```yaml
authMetadata:
  secretName: "/var/secrets/my-cluster-token"  # file path
  source: file
```

**Catalog:**

```yaml
vee.codes/kubernetes-secret-name: "/var/secrets/my-cluster-token"
vee.codes/kubernetes-secret-source: "file"
```

## Backward Compatibility

The auth strategy supports **both prefixed and unprefixed keys** for maximum compatibility:

- **Prefixed keys** (catalog): `vee.codes/kubernetes-secret-name`, `vee.codes/kubernetes-secret-source`, etc.
- **Unprefixed keys** (config): `secretName`, `source`, `namespace`, `tokenName`

The strategy checks for prefixed keys first, then falls back to unprefixed keys. This means:

- Old config-based clusters continue to work without changes
- New catalog-based clusters use the recommended prefixed annotations
- You can mix both approaches if needed

### Why Use Prefixed Annotations?

- **Namespace collision prevention**: Avoid conflicts with future Backstage or Kubernetes annotations
- **Clear ownership**: Makes it obvious these are Veecode-specific fields
- **Kubernetes convention**: Follows the standard pattern used by Kubernetes and Backstage
- **Consistency**: Matches your existing `vee.codes/` labels and annotations

## Migration Guide

Please understand **you do not need to migrate** anything. This is voluntary, just in case you want to stop using `app-config` editing to add new clusters.

### From Config to Catalog

**Before (app-config.yaml):**

```yaml
- type: 'config'
  clusters:
    - name: my-cluster
      url: https://my-cluster.example.com
      authProvider: 'serviceAccount'
      skipTLSVerify: true
      caData: LS0tLS...
      authMetadata:
        secretName: "my-secret"
        source: secret
        namespace: default
```

**After (catalog entity):**

```yaml
apiVersion: backstage.io/v1alpha1
kind: Resource
metadata:
  name: my-cluster
  annotations:
    kubernetes.io/api-server: 'https://my-cluster.example.com'
    kubernetes.io/auth-provider: serviceAccount
    kubernetes.io/skip-tls-verify: 'true'
    kubernetes.io/api-server-certificate-authority: LS0tLS...
    backstage.io/kubernetes-cluster: my-cluster
    vee.codes/kubernetes-secret-name: "my-secret"
    vee.codes/kubernetes-secret-source: "secret"
    vee.codes/kubernetes-secret-namespace: "default"
spec:
  type: kubernetes-cluster
```

## Other Configuration Options

Add these to your `app-config.yaml`:

```yaml
veecode:
  kubernetes:
    # Enable enhanced catalog cluster supplier ( default: true)
    enableEnhancedCatalogSupplier: true
    # Enable merging catalog and config-based clusters (default: true)
    mergeCatalogWithConfig: true
    # Default skipTLSVerify for clusters without this setting (default: false)
    defaultSkipTLSVerify: false
    # Default skipMetricsLookup for clusters without this setting (default: false)
    defaultSkipMetricsLookup: false
    # Require authMetadata on all clusters (default: false)
    requireAuthMetadata: false
    # Add default Kubernetes auth strategies (default: false)
    addDefaultKubernetesAuthStrategies: false
    # Use raw HTTPS for secret fetching (default: false)
    fetchSecretWithRawHttps: false
```

### Configuration Details

| Setting | Description | Default | When to Use |
|---------|-------------|---------|-------------|
| `enableEnhancedCatalogSupplier` | Enable/disable the enhanced catalog cluster supplier | `true` | Set to `false` to use only custom auth without catalog enhancements |
| `mergeCatalogWithConfig` | Merge catalog clusters with config-based clusters | `true` | Set to `false` to use only catalog clusters |
| `defaultSkipTLSVerify` | Default TLS verification for clusters | `false` | Set to `true` for development environments |
| `defaultSkipMetricsLookup` | Skip metrics collection by default | `false` | Set to `true` to reduce cluster load |
| `requireAuthMetadata` | Force all clusters to have auth metadata | `false` | Set to `true` for security compliance |
| `addDefaultKubernetesAuthStrategies` | Include default Kubernetes auth strategies | `false` | Set to `true` to use multiple auth providers |
| `fetchSecretWithRawHttps` | Use raw HTTPS for secret fetching | `false` | Set to `true` if in-cluster secret fetching fails |

### Usage Examples

#### Catalog-Based Clusters Only

```yaml
veecode:
  kubernetes:
    enableEnhancedCatalogSupplier: true
    mergeCatalogWithConfig: false  # Don't merge with config clusters
```

Define clusters in your catalog:

```yaml
apiVersion: backstage.io/v1alpha1
kind: Resource
metadata:
  name: my-cluster
  annotations:
    # Required annotations for catalog cluster locator
    kubernetes.io/api-server: 'https://my-cluster.example.com'
    kubernetes.io/api-server-certificate-authority: '<base64-ca-cert>'
    kubernetes.io/auth-provider: serviceAccount
    kubernetes.io/skip-tls-verify: 'false'
    
    # Optional: Filter resources by label
    backstage.io/kubernetes-label-selector: "env=prod"
spec:
  type: kubernetes-cluster
  lifecycle: production
  owner: platform-team
```

#### Mixed Config and Catalog Clusters

```yaml
veecode:
  kubernetes:
    enableEnhancedCatalogSupplier: true
    mergeCatalogWithConfig: true  # Both sources
```

```yaml
kubernetes:
  clusterLocatorMethods:
    - type: 'catalog'  # Load from catalog
    - type: 'config'   # Also load from config
      clusters:
        - name: dev-cluster
          url: https://127.0.0.1:9000
          authProvider: 'serviceAccount'
          skipTLSVerify: true
          authMetadata:
            secretName: "my-secret"
            source: secret
            namespace: default
```

#### Custom Auth Only (No Catalog Enhancements)

```yaml
veecode:
  kubernetes:
    enableEnhancedCatalogSupplier: false  # Disable catalog supplier
```

```yaml
kubernetes:
  clusterLocatorMethods:
    - type: 'config'
      clusters:
        - name: my-cluster
          url: https://my-cluster.example.com
          authProvider: 'serviceAccount'
          authMetadata:
            secretName: "my-secret"
            source: secret
            namespace: default
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

## Extra settings

### Optional: Enable Default Auth Strategies

By default, this module replaces the default `serviceAccount` strategy, but as a side effect it also desables all other Kubernetes authentication strategies (not sure if this is expected behavior). To keep all default Backstage Kubernetes auth strategies, add this setting:

```yaml
veecode:
  kubernetes:
    addDefaultKubernetesAuthStrategies: true
```

This enables: `google`, `googleServiceAccount`, `aws`, `aks`, `azureIdentity`, `oidc`, and `localKubectlProxy`.

## Additional Notes

### What is hard to understand

When using the `secret` source, this plugin will fetch secrets from a cluster in runtime (usually the one itself is running), in order to get a serviceAccount token to authenticate against **another cluster** (the one listed in `app-config.yaml`).

In short: you are reading a secret from your current cluster containing a token that allows Backstage to connect to the remote cluster listed in `app-config.yaml` (or read from the catalog). *Don't confuse how the code connects to fetch a secret from a cluster (usually the same cluster DevPortal runs) with how the code uses the fetched token to connect to another cluster.*

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

### RBAC Permissions (fetching secrets)

The DevPortal pod's ServiceAccount needs these permissions to read secrets:

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

### RBAC Permissions (kubernetes plugin)

The kubernetes plugins itself needs read-only permissions to query the remote clusters. Each token must belong to a serviceAccount with the permissions listed in [Role Based Access Control](https://backstage.io/docs/features/kubernetes/configuration/#role-based-access-control) page from the plugin's documentation.

## Complete Configuration Example (config-based)

This shows how each cluster can choose a different strategy.

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

## Complete Production Example (catalog-based)

### app-config.yaml

```yaml
veecode:
  kubernetes:
    enableEnhancedCatalogSupplier: true
    mergeCatalogWithConfig: true
    defaultSkipTLSVerify: false
    requireAuthMetadata: true  # Security requirement

kubernetes:
  serviceLocatorMethod:
    type: 'singleTenant'
  clusterLocatorMethods:
    - type: 'catalog'  # Primary source
    - type: 'config'   # Bootstrap/admin clusters only
      clusters:
        - name: admin-cluster
          url: https://admin.k8s.internal
          authProvider: 'serviceAccount'
          skipTLSVerify: false
          caData: ${ADMIN_CA_DATA}
```

### Catalog Entity - Production Cluster

```yaml
apiVersion: backstage.io/v1alpha1
kind: Resource
metadata:
  name: production-cluster
  title: Production Kubernetes Cluster
  annotations:
    # Required for catalog cluster locator
    kubernetes.io/api-server: 'https://prod-k8s.example.com'
    kubernetes.io/auth-provider: serviceAccount
    kubernetes.io/skip-tls-verify: 'false'
    kubernetes.io/api-server-certificate-authority: LS0tLS1CRUdJTi...
    
    # Backstage configuration
    backstage.io/kubernetes-cluster: production-cluster
    backstage.io/kubernetes-label-selector: "env=production"
    
    # Optional: Dashboard integration
    kubernetes.io/dashboard-url: 'https://dashboard.prod-k8s.example.com'
    kubernetes.io/dashboard-app: 'standard'
    
    # Veecode custom auth (fetch token from K8s secret)
    vee.codes/kubernetes-secret-name: "prod-cluster-token"
    vee.codes/kubernetes-secret-source: "secret"
    vee.codes/kubernetes-secret-namespace: "backstage-system"
    vee.codes/kubernetes-token-name: "token"
spec:
  type: kubernetes-cluster
  lifecycle: production
  owner: platform-team
  system: kubernetes-infrastructure
```

### Catalog Entity - Development Cluster

```yaml
apiVersion: backstage.io/v1alpha1
kind: Resource
metadata:
  name: development-cluster
  title: Development Kubernetes Cluster
  annotations:
    kubernetes.io/api-server: 'https://dev-k8s.example.com'
    kubernetes.io/auth-provider: serviceAccount
    kubernetes.io/skip-tls-verify: 'true'
    backstage.io/kubernetes-cluster: development-cluster
    
    # Dev cluster uses file-based token for easier local development
    vee.codes/kubernetes-secret-name: "/etc/kubernetes/dev-token"
    vee.codes/kubernetes-secret-source: "file"
spec:
  type: kubernetes-cluster
  lifecycle: development
  owner: platform-team
  system: kubernetes-infrastructure
```

### Kubernetes Secrets for Authentication

```bash
# Production cluster token
kubectl create secret generic prod-cluster-token \
  --from-literal=token="eyJhbGciOiJSUzI1NiIsImtp..." \
  --namespace=backstage-system

# Staging cluster token (environment variable approach)
kubectl create secret generic staging-credentials \
  --from-literal=STAGING_K8S_TOKEN="eyJhbGciOiJSUzI1NiIsImtp..." \
  --namespace=backstage-system
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

#### Authentication Issues

##### "Secret has no data field"

- **Cause**: The Kubernetes secret doesn't have a `data` field or the specified `tokenName`
- **Solution**: Check the secret with `kubectl get secret <name> -n <namespace> -o yaml`
- **Example**:

  ```bash
  kubectl get secret my-secret -n default -o yaml
  # Ensure the secret has data.token field
  ```

##### "Failed to fetch Kubernetes secret: 403 Forbidden"

- **Cause**: Backstage's ServiceAccount lacks RBAC permissions to read secrets
- **Solution**: Apply the RBAC configuration shown in the RBAC Permissions section
- **Verification**:

  ```bash
  kubectl auth can-i get secrets --as=system:serviceaccount:default:backstage
  ```

##### "Failed to fetch Kubernetes secret: 404 Not Found"

- **Cause**: Secret doesn't exist in the specified namespace
- **Solution**: Verify the secret exists and check namespace
- **Verification**:
  
  ```bash
  kubectl get secret <name> -n <namespace>
  ```

##### Authentication fails with valid token

- **Cause**: Token encoding issues or incorrect token format
- **Solution**:
  - For Kubernetes secrets: Ensure token is base64 encoded (plugin auto-decodes)
  - For files/env vars: Ensure token is in plain JWT format (not base64 encoded)
- **Debug**: Check the token format with `echo "token" | base64 -d` if needed

#### Catalog Cluster Issues

##### Clusters not appearing from catalog

- **Cause**: Enhanced catalog supplier disabled or catalog entities not found
- **Solution**:
  1. Check `enableEnhancedCatalogSupplier` is `true`
  2. Verify catalog entities have correct `type: kubernetes-cluster`
  3. Check required annotations are present
- **Debug**: Look for "VEECODE: Retrieved X clusters from catalog" messages

##### "Cluster missing authMetadata" warnings

- **Cause**: `requireAuthMetadata: true` but cluster lacks auth metadata
- **Solution**: Either add auth metadata or set `requireAuthMetadata: false`
- **Example**: Add `vee.codes/kubernetes-secret-name` annotation to catalog entity

##### Config clusters not appearing when merging

- **Cause**: `mergeCatalogWithConfig: false` or duplicate cluster names
- **Solution**:
  1. Set `mergeCatalogWithConfig: true`
  2. Ensure config and catalog clusters have different names
  3. Check cluster locator methods include both 'catalog' and 'config'

#### Configuration Issues

##### "No implementation available for apiRef{plugin.notifications.service}"

- **Cause**: Missing notifications API in plugin configuration
- **Solution**: This is unrelated to this module - check other plugin configurations

##### Module not loading

- **Cause**: Module not properly registered in backend
- **Solution**: Ensure module is added to `packages/backend/src/index.ts`
- **Example**:

  ```typescript
  backend.add(import('@veecode-platform/plugin-kubernetes-backend-module-getsecret'));
  ```

#### Secret Fetching Issues

##### In-cluster secret fetching fails

- **Cause**: Running outside Kubernetes or incorrect service account
- **Solution**: 
  1. Set `fetchSecretWithRawHttps: true` if needed
  2. Check KUBECONFIG environment variable
  3. Verify service account permissions
- **Debug**: Check for "VEECODE: Detected in-cluster environment" messages

##### Environment variable not found

- **Cause**: Environment variable not set or incorrect name
- **Solution**: 
  1. Set the environment variable in Backstage deployment
  2. Check for typos in variable name
  3. Verify variable is available to backend process
- **Example**:

  ```bash
  export MY_CLUSTER_TOKEN="eyJhbGciOiJSUzI1NiIsImtp..."
  ```

##### File not found or not readable

- **Cause**: File path incorrect or permissions issue
- **Solution**: 
  1. Verify file exists and is readable by Backstage process
  2. Check absolute vs relative paths
  3. Ensure file is mounted in container (if running in Kubernetes)
- **Debug**: Check file permissions with `ls -la /path/to/token`

### Debug Commands

#### Check Kubernetes Configuration

```bash
# Check current kubeconfig context
kubectl config current-context

# Test cluster access
kubectl get nodes

# Check service account permissions
kubectl auth can-i get secrets --as=system:serviceaccount:default:<your-pod-serviceaccount>
```

#### Verify Catalog Entities

```bash
# get guest token
TOKEN=$(curl -s -X POST http://localhost:7007/api/auth/guest/refresh | jq -r '.backstageIdentity.token')

# Use Backstage API to check catalog
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:7007/api/catalog/entities" | jq

# Check specific entity
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:7007/api/catalog/entities/by-name/resource/default/my-cluster" | jq
```

#### Test Secret Access

Check if Backstage pod can read secrets:

```bash
# Test secret reading (in-cluster)
kubectl auth can-i get secrets --as=system:serviceaccount:default:backstage

# Check secret contents
kubectl get secret my-secret -o jsonpath='{.data.token}' | base64 -d
```

### Performance Issues

#### Slow cluster discovery

- **Cause**: Large catalog or many clusters
- **Solution**:
  1. Enable debug logging to identify bottlenecks
  2. Consider using `requireAuthMetadata: false` if validation is slow
  3. Optimize catalog queries with proper labels

#### Memory usage high

- **Cause**: Too many clusters or large configurations
- **Solution**:
  1. Reduce number of clusters per configuration
  2. Use `skipMetricsLookup: true` for clusters that don't need metrics
  3. Monitor cluster resource usage

### Getting Help

1. **Enable debug logging** and collect logs
2. **Check GitHub Issues** for similar problems
3. **Provide configuration details** (remove sensitive data)
4. **Include environment details** (Kubernetes version, Backstage version)
5. **Share specific error messages** and steps to reproduce

## License

Apache-2.0

## Support

For issues and questions:

- GitHub Issues: [veecode-platform/devportal-plugins](https://github.com/veecode-platform/devportal-plugins)
- Documentation: [VeeCode Platform Docs](https://docs.veecode.platform)
