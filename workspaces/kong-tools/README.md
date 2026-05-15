# kong-tool workspace

This repository contains a Backstage hosting app for development of Kong-related Backstage plugins.

## Reference implementation

This workspace structure is based on the sibling "dummy" workspace, which is a simplified reference workspace containing a frontend plugin, a backend plugin and a backstage hosting app.

## Pre-requisites

Start Kong Gateway with Manager (Admin UI) enabled:

```sh
vkdr infra up
vkdr kong install --default-ic -t 3.9.1 -m standard -d localdomain
```

After Kong starts, deploy a sample service:

```sh
kubectl apply -f examples/k8s/
```

You can test the created service and routes by running:

```sh
curl localhost:8000/cep/88080700/json
```

**Note:** Make sure to set the `manager.localdomain` name to resolve to `127.0.0.1` in your `/etc/hosts` file.

## How to start

To start the app, run:

```sh
yarn install
yarn start
```

## User profiles and permissions

The workspace ships three user profiles with different permission levels:

| Profile | Group | Permissions |
|---|---|---|
| `admin` (default) | `kong-admins` | Full access |
| `operator` | `kong-operators` | Read + plugin mutations (no route mutations) |
| `viewer` | `kong-viewers` | Read-only |

Switch profiles with the `DEVPORTAL_USER` environment variable:

```sh
yarn start                          # admin (full access)
DEVPORTAL_USER=operator yarn start  # operator
DEVPORTAL_USER=viewer yarn start    # viewer (read-only)
```

The guest auth provider resolves the identity to `user:default/<DEVPORTAL_USER>`,
and the custom permission policy in `packages/backend/src/permissionPolicy.ts`
maps it to the corresponding role. No restart of the frontend is needed — only the
backend must be restarted when switching profiles.

## Original code

The original code for the "kong-service-manager*" plugins can be found at <https://github.com/veecode-platform/platform-backstage-plugins/tree/master/plugins>, specifically in the `kong-service-manager`, `kong-service-manager-backend` and `kong-service-manager-common` directories.
