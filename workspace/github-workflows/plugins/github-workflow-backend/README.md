# github-workflow-backend

This plugin provides GitHub workflows API endpoints for Backstage, moving GitHub API interactions from the frontend to the backend for better security, CORS handling, and potential caching.

## Features

- Exposes GitHub workflows API endpoints at `/gh-workflows`
- Handles GitHub authentication securely on the backend
- Supports all GitHub workflow operations:
  - List workflows
  - List branches
  - Get default branch
  - Start workflow runs
  - Stop workflow runs
  - List jobs for workflow runs
  - Get workflow run details
  - Download job logs
  - List environments

## Installation

This plugin is installed via the `@veecode-platform/backstage-plugin-github-workflows-backend` package. To install it to your backend package, run the following command:

```bash
# From your root directory
yarn --cwd packages/backend add @veecode-platform/backstage-plugin-github-workflows-backend
```

Then add the plugin to your backend in `packages/backend/src/index.ts`:

```ts
const backend = createBackend();
// ...
backend.add(import('@veecode-platform/backstage-plugin-github-workflows-backend'));
```

## Configuration

Add the following configuration to your `app-config.yaml`:

### Option 1: GitHub App (Recommended)

GitHub Apps are preferred over personal access tokens for better security and permissions. The plugin uses Backstage's standard `ScmIntegrations` which automatically handles GitHub App authentication.

```yaml
integrations:
  github:
    - host: github.com
      apps:
        - appId: ${GITHUB_APP_ID}
          clientId: ${GITHUB_CLIENT_ID}
          clientSecret: ${GITHUB_CLIENT_SECRET}
          privateKey: |
            ${GITHUB_PRIVATE_KEY}
      # Optional fallback token if GitHub App auth fails
      # token: ${GITHUB_TOKEN}
```

**Required Environment Variables:**

- `GITHUB_APP_ID` - Your GitHub App ID
- `GITHUB_CLIENT_ID` - Your GitHub App Client ID
- `GITHUB_CLIENT_SECRET` - Your GitHub App Client Secret
- `GITHUB_PRIVATE_KEY` - Your GitHub App Private Key (PEM format, with newlines)

**For GitHub Enterprise:**

```yaml
integrations:
  github:
    - host: github.yourcompany.com
      apps:
        - appId: ${GITHUB_APP_ID}
          clientId: ${GITHUB_CLIENT_ID}
          clientSecret: ${GITHUB_CLIENT_SECRET}
          privateKey: |
            ${GITHUB_PRIVATE_KEY}
      apiBaseUrl: https://github.yourcompany.com/api/v3
```

**How to verify GitHub App authentication:**

When the plugin starts, you'll see log messages indicating which authentication method is being used:

```log
info: GitHub integration using GitHub App installation token for github.com/owner/repo
```

### Option 2: Personal Access Token Only

If you don't have a GitHub App, you can use a personal access token:

```yaml
integrations:
  github:
    - host: github.com
      token: ${GITHUB_TOKEN}
```

**Required Permissions:**

- `repo` - Full control of private repositories
- `workflow` - Update GitHub Action workflows

**Note:** The plugin will automatically try GitHub App authentication first, then fall back to the token if the app fails or isn't configured.

## Development

This plugin backend can be started in a standalone mode from directly in this
package with `yarn start`. It is a limited setup that is most convenient when
developing the plugin backend itself.

### Testing in Isolation

When running the backend in isolation with `yarn start`, you can test the endpoints directly with curl. The dev setup uses mock authentication, so no auth headers are required.

Set your environment variables:

```bash
export GITHUB_TOKEN=your_github_token_here
export REPO_SLUG=veecode-platform/devportal-base  # e.g., octocat/Hello-World
```

Then test the endpoints:

```bash
# List workflows
curl "http://localhost:7007/api/github-workflow-backend/workflows?hostname=github.com&githubRepoSlug=${REPO_SLUG}&branch=main"

# List branches
curl "http://localhost:7007/api/github-workflow-backend/branches?hostname=github.com&githubRepoSlug=${REPO_SLUG}"

# Get default branch
curl "http://localhost:7007/api/github-workflow-backend/default-branch?hostname=github.com&githubRepoSlug=${REPO_SLUG}"

# List environments
curl "http://localhost:7007/api/github-workflow-backend/environments?hostname=github.com&githubRepoSlug=${REPO_SLUG}"

# Start a workflow (replace workflowId with actual workflow ID)
curl -X POST "http://localhost:7007/api/github-workflow-backend/start" \
  -H "Content-Type: application/json" \
  -d "{
    \"hostname\": \"github.com\",
    \"githubRepoSlug\": \"${REPO_SLUG}\",
    \"workflowId\": 12345,
    \"branch\": \"main\",
    \"inputs\": {}
  }"

# Get workflow run details (replace 123456 with actual run ID)
curl "http://localhost:7007/api/github-workflow-backend/run/123456?hostname=github.com&githubRepoSlug=${REPO_SLUG}"

# List jobs for a workflow run (replace 123456 with actual run ID)
curl "http://localhost:7007/api/github-workflow-backend/jobs?hostname=github.com&githubRepoSlug=${REPO_SLUG}&id=123456"

# Download job logs (replace 987654 with actual job ID)
curl "http://localhost:7007/api/github-workflow-backend/logs/987654?hostname=github.com&githubRepoSlug=${REPO_SLUG}"

# Stop a workflow run (replace 123456 with actual run ID)
curl -X POST "http://localhost:7007/api/github-workflow-backend/stop" \
  -H "Content-Type: application/json" \
  -d "{
    \"hostname\": \"github.com\",
    \"githubRepoSlug\": \"${REPO_SLUG}\",
    \"runId\": 123456
  }"
```

## API Endpoints

The plugin exposes the following endpoints under `/gh-workflows`:

- `GET /workflows` - List workflows
- `GET /branches` - List repository branches  
- `GET /default-branch` - Get default branch
- `POST /start` - Start a workflow run
- `POST /stop` - Stop a workflow run
- `GET /jobs` - List jobs for a workflow run
- `GET /run/:id` - Get workflow run details
- `GET /logs/:jobId` - Download job logs
- `GET /environments` - List environments

If you want to run the entire project, including the frontend, run `yarn start` from the root directory.
