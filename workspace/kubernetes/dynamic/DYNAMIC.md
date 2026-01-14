# Dynamic Loading Test

TODO: simplify this somehow.

In order to test the dynamic loading of this kubernetes plugin **before creating a public release on NPM**, we need a little hack to use our distro mounting folder.

## Build the plugin

Run the Makefile tasks that build the dynamic plugin (but do not publish it to NPM yet). The `make` command is ran from the root of this repository.

```bash
make build-kubernetes-dynamic
```

This will create a `dist-dynamic/dist` folder in the plugin directory.

## Start a local cluster

Start a `vkdr` local cluster and deploy some labeled services in it:

```sh
cd workspace/kubernetes/dynamic/
vkdr infra start --api-port 9000
vkdr kong install --default-ic --label=vee.codes/cluster=vkdr-config-cluster
vkdr whoami install --label=vee.codes/cluster=vkdr-catalog-cluster
```

## Create serviceAccount token

Create a serviceAccount token and export it to an environment variable:

```sh
# fetch token and cadata
export K8S_SA_TOKEN=$(vkdr infra createToken --silent)
export K8S_CA_DATA=$(vkdr infra getca --silent)
```

You can test this token easily in a very isolated way:

```sh
docker run --rm -ti alpine/kubectl get nodes -s https://host.docker.internal:9000 --token "$K8S_SA_TOKEN" --tls-server-name "kubernetes.default" --insecure-skip-tls-verify
```

## Create serviceAccount secret

Create the secret that will be used to fetch the token from the cluster:

```sh
# fetch token and cadata
export K8S_SA_TOKEN=$(vkdr infra createToken --silent)
export K8S_CA_DATA=$(vkdr infra getca --silent)
kubectl create secret generic mysecret \
  --from-literal=token="$K8S_SA_TOKEN"
```

## Build the dynamic plugin

Run the Makefile tasks that build the dynamic plugin (but do not publish it to NPM yet). The `make` command is ran from the root of this repository.

```bash
make build-kubernetes-dynamic
```

This will create a `dist-dynamic/dist` folder in the plugin directory.

## Hack our distro

We will use `docker compose` to mount the dynamic plugin directly into the DevPortal dynamic plugins folder:

```sh
# start devportal with dynamic plugin mounted
docker compose up --no-log-prefix
```
