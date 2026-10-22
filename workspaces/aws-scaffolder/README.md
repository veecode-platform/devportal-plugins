# aws-scaffolder

This workspace contains a `backend-plugin-module` for the scaffolder plugin
(`plugins/scaffolder-backend-module-aws-lambda`) and only the harness needed to prove it before
it is published through the export overlay. The module was created with `backstage-cli new`;
the dev shell, `dynamic-plugins.yaml` and this guidance come from the repository workspace
template.

## Local flow

```bash
yarn install
yarn start
yarn dev:dynamic
```

The last command exports locally; it does not publish or start Docker. It also
carries this workspace's dynamic-plugin configuration into the ignored
runner directory and prints the complete Compose command. Follow that printed
command in `devportal-local` for proof 2; no runner config edit is needed.
