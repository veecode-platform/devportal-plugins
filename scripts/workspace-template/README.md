# {{name}}

This workspace contains a `{{role}}` package and only the harness needed to prove
that package before it is published through the export overlay. The package under
`plugins/` was created with `backstage-cli new`; the harness, `dynamic-plugins.yaml`
and this guidance come from the repository workspace template.

## Local flow

```bash
yarn install
yarn {{primary_command}}
yarn dev:dynamic
```

The last command exports locally; it does not publish or start Docker. It also
carries this workspace's dynamic-plugin configuration into the ignored
runner directory and prints the complete Compose command. Follow that printed
command in `devportal-local` for proof 2; no runner config edit is needed.
