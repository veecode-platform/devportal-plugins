# catalog-backend-module-ai-resources

Backend module for the `catalog` plugin that activates Backstage core's
**`AiResource`** entity kind (`apiVersion: backstage.io/v1alpha1`, spec types
`skill` and `rule`) plus the **McpServer** API model, by registering the model
layers that `@backstage/catalog-model` already ships behind its `/alpha`
export.

It is registration-only — no schema, validator, processor, or relation logic
lives here. Everything comes from the host's own catalog-model, so the kind's
vocabulary advances automatically when the DevPortal image upgrades. See
devportal-planning ADR-007 for the decision record.

Deployments enabling this module must also allow the kind in `catalog.rules`:

```yaml
catalog:
  rules:
    - allow: [Component, System, API, Resource, Location, Template, Group, User, Domain, AiResource]
```

Example entity:

```yaml
apiVersion: backstage.io/v1alpha1
kind: AiResource
metadata:
  name: template-builder
  description: Judgment engine for platform scaffolder templates.
spec:
  type: skill
  lifecycle: production
  owner: group:default/platform-team
  agents:
    - claude-code
```
