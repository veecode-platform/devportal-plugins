# Plugin Decision Records

Workspace-local design decisions for `ai-resources`, numbered `PDR-001`, `PDR-002`, … and
cited outside this workspace as `ai-resources PDR-NNN`. They are plugin decision records, not
ADRs: decisions with cross-workspace or lasting weight live in the planning repository
`veecode-platform/devportal-plugins-parent` as `plugins ADR-NNNN`.

## PDR-001: Registration Only, With Pins That Track the Host's Model

**Date:** recorded 2026-09-15; implements a product decision taken 2026-08-21
**Status:** Accepted

**What this module does and deliberately does not do.** It registers Backstage core's
`AiResource` entity kind and the `McpServer` API model with the catalog, and nothing else. It
adds the model sources the host's own `@backstage/catalog-model` already exports, through the
catalog's model extension point. It ships **no schema, no validator, no processor and no
relation logic of its own**, and it defines no vocabulary: the `spec` types, the validation
and the `ownedBy` and `partOf` relations are all the host's.

**The dependency pins are part of the decision, not incidental.** `@backstage/catalog-model`
and `@backstage/plugin-catalog-node` are pinned with a tilde to the versions verified against
the running DevPortal image, rather than carried as open ranges. The reason is the failure a
wider range allows: this module could otherwise embed a newer model than the host ships and
register schemas the host does not otherwise carry, so the catalog would accept entities the
rest of the portal cannot interpret. Keeping the pins narrow makes the embedded copy a mirror
of the host's, never an upgrade to it.

The consequence is intended: the kind's vocabulary advances when the DevPortal image advances,
not when this package is republished. When the host moves, re-verify against the image and
move the pins with it.

**Rationale:** upstream already models this domain in Backstage core, so the cheap and durable
answer is to activate what the host ships rather than to define a parallel vocabulary that
would then need maintaining against it. A registration-only module has almost no surface to
break, which is why it also has no tests: there is no behaviour here that is ours.

**Upstream decision.** Whether the DevPortal catalogs AI resources at all, and why the choice
was to activate core's `AiResource` kind rather than invent one, is a product decision of the
RHDH-fork mission, recorded in its own repository as `devportal-planning ADR-007` (owner Gio,
2026-08-21). That decision is not this program's to restate or revise; this record covers only
how the module implements it.
