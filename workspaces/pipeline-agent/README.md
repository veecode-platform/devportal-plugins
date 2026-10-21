# Pipeline Agent Workspace

This workspace contains the pipeline agent frontend, backend, and common packages,
plus a dev shell for running them locally.

On an entity page, the pipeline agent card starts an investigation of the entity's
failed GitLab pipeline. The agent diagnoses the failure and proposes a fix. A person
approves the proposal, then the backend opens a merge request and follows the pipeline
that runs on it.

## Packages

- `plugins/pipeline-agent` (frontend-plugin): the entity card `PipelineAgentCard`. The
  condition `isPipelineAgentAvailable` shows it only on entities that carry
  `veecode.io/pipeline-agent: enabled` and a `gitlab.com/project-slug` annotation.
- `plugins/pipeline-agent-backend` (backend-plugin): the routes of the contract, the
  investigations, and the GitLab and agent adapters. Its configuration is declared in
  `config.d.ts`.
- `plugins/pipeline-agent-common` (common-library): the wire types, the route constants,
  the annotation names, and the catalog permissions `pipeline-agent.investigation.create`
  and `pipeline-agent.investigation.approve`.

## Configuration

- `pipelineAgent.mode`: `fake` (default) runs scripted investigations with no Anthropic
  or GitLab calls. `real` calls the Managed Agents API and GitLab.
- `pipelineAgent.allowedProjects`: `{ project, entityRef }` bindings. An entity writes
  only to the project bound to it. Fake mode defaults to `veecode-demos/pedidos-api`
  bound to `component:default/pedidos-api`. Real mode with no list denies every project.
- `pipelineAgent.anthropic.apiKey`, `pipelineAgent.agentId`,
  `pipelineAgent.environmentId`: real mode only. Without them the backend starts, logs
  the missing keys, and answers `503` on every route except `/health`.
- `pipelineAgent.gitlab.token`, `pipelineAgent.gitlab.baseUrl`: real mode only. The
  token opens merge requests. The base URL defaults to `https://gitlab.com`.

The two secrets are declared `@visibility secret`. Only the backend reads them.

## Opt-in and project binding

An entity answers the contract only when it carries `veecode.io/pipeline-agent: enabled`.
Any other entity is answered as unknown. The backend takes the GitLab project from the
entity's `gitlab.com/project-slug` annotation, and only when `allowedProjects` binds that
slug to the same entity. The browser never sends a project.

## Running the dev shell

```sh
yarn install
yarn start
```

The dev shell serves the `pedidos-api` example entity from `examples/entities.yaml`.
Open its CI/CD tab to see the card. The backend starts in `fake` mode, so no Anthropic
key or GitLab token is needed.

## Exporting for a portal

```sh
yarn dev:dynamic
```

The command exports the frontend and the backend (embedding the private common package)
and prints the `devportal-local` command to run them. The rules for the four proofs are
in [CONTRIBUTING.md](../../CONTRIBUTING.md#the-four-proofs-and-the-official-test-flow).

Decisions specific to this workspace are in [DECISIONS.md](DECISIONS.md).
