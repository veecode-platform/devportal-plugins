# Architecture Decision Records

Decisions taken while building the `@veecode-platform/backstage-plugin-pipeline-agent-*`
packages in this workspace.

## PDR-001: The backend holds the agent session and the write token

**Date:** 2026-10-21
**Status:** Accepted

An investigation runs as an agent session on the Anthropic Managed Agents API, and
its merge request is opened with a GitLab token that can write to the project. Both
secrets (`pipelineAgent.anthropic.apiKey` and `pipelineAgent.gitlab.token`) are
declared `@visibility secret` and read only by the backend.

The frontend never talks to Anthropic or GitLab. It calls the backend's contract
routes and reads the investigation's events from the backend's SSE stream. The
investigation id the browser receives identifies a session, but it grants nothing
without the backend's key.

Project resolution is entity-anchored. Each request that starts or lists work names a
catalog entity (`entityRef`), and the backend reads the GitLab project from that
entity's `gitlab.com/project-slug` annotation. The browser never supplies a project
path, so a user cannot point the agent at a repository the catalog does not attribute
to the entity they are viewing.

**Rationale:** the write token and the agent key are the two capabilities that can
change a repository or spend on the Anthropic account. Keeping both behind the backend
means a compromised browser session gains no direct access to either. The portal's
authentication and permission checks gate every write once the handlers land; the
current routes return `501`, so that gate is not yet enforced. Anchoring the project to
the entity keeps the catalog the single source of which repository an entity owns.

## PDR-002: The HTTP contract mirrors the prototype

**Date:** 2026-10-21
**Status:** Accepted

The routes, request bodies, response bodies, and SSE event union of the plugin match
the working prototype's API (`app/api/**`, `lib/ui-events.ts`) name for name. The
prototype's measurement harness drives those routes, so the plugin can be measured with
the same harness without an adapter.

The contract lives in `plugins/pipeline-agent-common`, and the frontend and backend
both import it. Two additions are deliberate. Each call that starts or lists work
carries `entityRef` (PDR-001). The `aprovar`, `recusar`, and `orientar` bodies keep the
prototype's `toolUseId`, which names the pending proposal a decision applies to.

**Rationale:** a contract the harness already exercises is the cheapest proof that the
plugin behaves like the prototype. Any change that breaks the mirror must update the
harness in the same change, so the drift is visible at review time rather than found in
a demo.
