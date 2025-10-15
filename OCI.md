# Build do plugin em uma imagem OCI para teste

A fins de testes, e sem a necessidade de publicação em um NPM, conseguimos criar um pacote OCI no docker, usando os seguintes comandos:

Exemplo usado no plugin `veecode-global-header`:

```bash
cd <o_caminho_do_plugin>
yarn build-dynamic-plugin
```

Esse comando compila o typescript (tsc) e exporta o plugin como dinâmico para a pasta `dist-dynamic`;

### Empacotar a imagem OCI com base na versão do `package.json`:

```bash
VERSION=$(jq -r .version package.json)

npx @janus-idp/cli@latest package package-dynamic-plugins \
  --tag docker.io/<docker-registry>/veecode-global-header:v$VERSION
```

### Criar tag latest (opcional)

```bash
podman tag \
  docker.io/<docker-registry>/veecode-global-header:v$VERSION \
  docker.io/<docker-registry>/veecode-global-header:latest
```


### Publicar as imagens no DockerHub

```bash
podman push docker.io/<docker-registry>/veecode-global-header:v$VERSION 

podman push docker.io/<docker-registry>/veecode-global-header:latest
```

### Usando o output para usar o plugin:

```bash
  - package: oci://docker.io/<docker-registry>/veecode-global-header:v0.1.3!veecode-platform-plugin-veecode-global-header
    disabled: false
 --- e as configurações de montagem (caso seja frontend), ou configs adicionais (caso seja backend)
```
