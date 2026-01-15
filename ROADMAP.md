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

- [ ] **1.1** Create Makefile for dummy workspace
  - [ ] Follow the standards defined in most other workspaces
  - [ ] Comment the Makefile to make it LLM friendly (so it bocemos the standard from now on)
- [ ] **1.2** Review and improve dummy workspace structure
  - [ ] Check package.json for Backstage standards
  - [ ] Make sure there is an "update-backstage" script (`"update-backstage": "backstage-cli versions:bump"` entry under "scripts")
- [ ] **1.3** Add/improve tests and test patterns
  - [ ] Understand current test patterns (the hosting app was generated with many testing patterns in place)
  - [ ] Check package.json for Backstage testing standards (ex: use the `backstage-cli repo test` command if it makes sense)
  - [ ] Make sure tests are simple and cover basic functionality (DO NOT be overzealous with unit tests)
  - [ ] Backend plugins and modules can be tested using the the `@backstage/backend-test-utils` package (see in [Testing Backend Plugins and Modules](https://backstage.io/docs/backend-system/building-plugins-and-modules/testing/))
- [ ] **1.4** Dynamic plugin testing
  - [ ] TODO
- [ ] **1.5** Document reference patterns in dummy README.md

### Phase 2: Document Reference Implementation

- [ ] **2.1** Update root CLAUDE.md to reference dummy as canonical example
- [ ] **2.2** Update root README.md workspace table
- [ ] **2.3** Document which aspects of dummy should be carried to other workspaces

### Phase 3: Create Hosting Apps (Future)

- [ ] **3.1** Create hosting app for `about` workspace
- [ ] **3.2** Create hosting app for `support` workspace
