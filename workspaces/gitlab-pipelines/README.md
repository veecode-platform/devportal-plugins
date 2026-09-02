# GitLab Pipelines Workspace

This workspace contains the GitLab Pipelines backend plugin and common library,
along with a hosting app used for development and testing.

## Development

Install dependencies and run the workspace typecheck:

```sh
yarn install
yarn tsc
```

The backend plugin is registered by the hosting backend and currently logs a
scaffold message during initialization. Its implementation will be added in
the next task.
