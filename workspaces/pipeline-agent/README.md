# Pipeline Agent Workspace

This workspace contains the pipeline agent frontend, backend, and common packages,
plus a dev shell for running them locally.

On an entity page, the pipeline agent card starts an agent that diagnoses the entity's
failed GitLab pipeline, proposes a fix, waits for a person to approve it, opens a merge
request, and follows the pipeline that runs on that merge request.

The current state is the skeleton: the card shows its title, the backend answers its
health check, and the other routes return `501`. The contract that the frontend and the
backend build against is in `plugins/pipeline-agent-common/src/contract.ts`.

## Packages

- `plugins/pipeline-agent` (frontend-plugin): the entity card `PipelineAgentCard` and
  the condition `isPipelineAgentAvailable`, which is true when the entity carries the
  `gitlab.com/project-slug` annotation.
- `plugins/pipeline-agent-backend` (backend-plugin): the router for the contract. Its
  configuration (`pipelineAgent.*`) is declared in `config.d.ts`. `mode` defaults to
  `fake`, and the secrets are `pipelineAgent.anthropic.apiKey` and
  `pipelineAgent.gitlab.token`.
- `plugins/pipeline-agent-common` (common-library): the wire types, the route
  constants and request and response bodies, the entity annotation constant, and the
  two catalog-entity permissions `pipeline-agent.investigation.create` and
  `pipeline-agent.investigation.approve`.

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
