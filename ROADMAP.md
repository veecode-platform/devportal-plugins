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
| dummy            | ✓           | ✗        | Needs work     |
| about            | ✗           | ✗        | Future work    |
| support          | ✗           | ✗        | Future work    |

## Roadmap

### Phase 1: Improve Dummy Workspace

We will start with the dummy workspace ("./workspace/dummy"), as it is the most basic example of a Backstage plugin and it is intended to become a reference implementation for other workspaces.

- [x] **1.1** Create Makefile for dummy workspace
  - [x] Follow the standards defined in most other workspaces
  - [x] Comment the Makefile to make it LLM friendly (so it becomos the standard from now on)
- [x] **1.2** Review and improve dummy workspace structure
  - [x] Check package.json for Backstage standards
  - [x] Make sure there is an "update-backstage" script (`"update-backstage": "backstage-cli versions:bump"` entry under "scripts")
- [ ] **1.3** Add/improve tests and test patterns
  - [ ] **Plugin Tests** (inside `plugins/*`)
    - [ ] Frontend plugins: component rendering tests using `@backstage/test-utils`
    - [ ] Backend plugins: use `@backstage/backend-test-utils` (see [Testing Backend Plugins and Modules](https://backstage.io/docs/backend-system/building-plugins-and-modules/testing/))
    - [ ] Keep tests simple - focus on basic functionality, avoid over-testing
  - [ ] **Hosting App Wiring Tests** (inside `packages/app` and `packages/backend`)
    - [ ] Verify plugins are correctly registered and exported
    - [ ] Test that plugin routes/pages are accessible
    - [ ] Test backend plugin endpoints respond correctly
  - [ ] **Test Infrastructure**
    - [ ] Review existing test patterns in the generated hosting app
    - [ ] Ensure `yarn test:all` runs all plugin and wiring tests
    - [ ] Document test commands in workspace README
- [ ] **1.4** Dynamic plugin testing
  - [x] Create the required files for dynamic plugin testing:
    - [x] docker-compose.yaml (mounts dynamic plugins and config files)
    - [x] app-config.dynamic.yaml (usually minimal or even empty)
    - [x] dynamic-plugins.yaml (enables the dynamic plugins)
  - [ ] Create tests to validate dynamic plugin functionality (runs against the container)
- [ ] **1.5** Check if documents like README.md are up to date

### Phase 2: Document Reference Implementation

- [ ] **2.1** Update root CLAUDE.md to reference dummy as canonical example
- [ ] **2.2** Update root README.md workspace table
- [ ] **2.3** Document which aspects of dummy should be carried to other workspaces

### Phase 3: Create Hosting Apps (Future)

- [ ] **3.1** Create hosting app for `about` workspace
- [ ] **3.2** Create hosting app for `support` workspace
