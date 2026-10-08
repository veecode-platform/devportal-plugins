# scaffolder-fields

Generic scaffolder field extensions for the VeeCode DevPortal. The first one is
[`CatalogEntityPrefill`](plugins/scaffolder-field-catalog-prefill/README.md), which fills
the properties of a template step from a catalog entity.

The workspace contains a `frontend-plugin` package and only the harness needed to prove
that package before it is published through the export overlay. The package under
`plugins/` was created with `backstage-cli new`; the harness, `dynamic-plugins.yaml`
and this guidance come from the repository workspace template. The dev shell has no
backend: it serves the fixtures in `examples/` through in-memory catalog and scaffolder
APIs.

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
