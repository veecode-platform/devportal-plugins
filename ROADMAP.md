# Roadmap: Workspace Standardization & Reference Implementation

## Current State

| Workspace        | Hosting App | Makefile | Status         |
|------------------|-------------|----------|----------------|
| homepage         | ✓           | ✓        | Ready          |
| global-header    | ✓           | ✓        | Ready          |
| github-workflows | ✓           | ✓        | Ready          |
| ldap-auth        | ✓           | ✓        | Ready          |
| kong-tools       | ✓           | ✓        | Ready          |
| kubernetes       | ✓           | ✓        | Ready          |
| dummy            | ✓           | ✓        | Ready          |
| about            | ✓           | ✓        | Ready          |

## Roadmap

### Phase 1: Improve Dummy Workspace

We will start with the dummy workspace ("./workspace/dummy"), as it is the most basic example of a Backstage plugin and it is intended to become a reference implementation for other workspaces.

- [x] **1.1** Create Makefile for dummy workspace
  - [x] Follow the standards defined in most other workspaces
  - [x] Comment the Makefile to make it LLM friendly (so it becomos the standard from now on)
- [x] **1.2** Review and improve dummy workspace structure
  - [x] Check package.json for Backstage standards
  - [x] Consistent build implementation — workspace use "yarn install" and "yarn tsc" and "yarn build:all"
  - [x] Make sure there is an "update-backstage" script (`"update-backstage": "backstage-cli versions:bump"` entry under "scripts")
- [x] **1.3** Add/improve tests and test patterns
  - [x] **Plugin Tests** (inside `plugins/*`)
    - [x] Frontend plugins: component rendering tests using `@backstage/test-utils`
    - [x] Backend plugins: use `@backstage/backend-test-utils` (see [Testing Backend Plugins and Modules](https://backstage.io/docs/backend-system/building-plugins-and-modules/testing/))
    - [x] Keep tests simple - focus on basic functionality, avoid over-testing
  - [x] **Hosting App Wiring Tests** (inside `packages/app` and `packages/backend`)
    - [x] Verify plugins are correctly registered and exported
    - [x] Test that plugin routes/pages are accessible
    - [x] Test backend plugin endpoints respond correctly
  - [x] **Test Infrastructure**
    - [x] Review existing test patterns in the generated hosting app
    - [x] Ensure `yarn test:all` runs all plugin and wiring tests
    - [x] Document test commands in workspace README
- [ ] **1.4** Dynamic plugin testing
  - [x] Create the required files for dynamic plugin testing:
    - [x] docker-compose.yaml (mounts dynamic plugins and config files)
    - [x] app-config.dynamic.yaml (usually minimal or even empty)
    - [x] dynamic-plugins.yaml (enables the dynamic plugins)
  - [ ] Create tests to validate dynamic plugin functionality (runs against the container)
- [x] **1.5** Check if documents like README.md are up to date

### Phase 2: Document Reference Implementation

- [x] **2.1** Update root AGENTS.md to reference dummy as canonical example
- [x] **2.2** Update root README.md workspace table
- [x] **2.3** Document which aspects of dummy should be carried to other workspaces
