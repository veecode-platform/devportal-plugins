# AGENTS.md — ldap-auth workspace

Agent context for this workspace. Repository-wide rules, including the shape this file follows, are in the root [`AGENTS.md`](../../AGENTS.md).

## What the plugins do

Username/password sign-in against an LDAP directory. Both packages are MIT-licensed forks of `immobiliare/backstage-plugin-ldap-auth` (see Gotchas).

- `plugins/ldap-auth` — `@veecode-platform/backstage-plugin-ldap-auth`, frontend, `createPlugin({ id: 'ldap-auth-frontend' })`. Exports `ldapAuthFrontendPlugin` and `LdapAuthFrontendPage` (alias of `LdapSignInPage`), a `SignInPage` replacement: a MUI v5 `LoginForm` plus `LdapSignInIdentity`, an `IdentityApi` that logs in, refreshes and signs out through the backend provider's `/refresh` and `/logout` routes and derives token expiry from the JWT `exp` claim.
- `plugins/ldap-auth-backend` — `@veecode-platform/backstage-plugin-ldap-auth-backend`, a backend **module** of the `auth` plugin: `createBackendModule({ pluginId: 'auth', moduleId: 'ldap' })` registers `providerId: 'ldap'` on `authProvidersExtensionPoint`. `ProviderLdapAuthProvider` serves `POST /api/auth/ldap/refresh` (username + password, or the `backstage-token` cookie) and `POST /api/auth/ldap/logout`; it binds to LDAP with `ldap-authentication`/`ldapjs` and signs the user in with `ctx.signInWithCatalogUser`.

Both packages publish with `publishConfig.access: public`. The hosting app (`packages/app`, `packages/backend`) exists to run and test them; its backend also loads `@backstage/plugin-catalog-backend-module-ldap` so LDAP users exist in the catalog.

## Layout

Standard shape (root `AGENTS.md`), plus:

```pre
workspaces/ldap-auth/
├── packages/
│   ├── app/src/App.tsx                  # SignInPage: <LdapAuthFrontendPage provider="ldap" />
│   ├── app/e2e-tests/app.test.ts        # Playwright (see Gotchas)
│   └── backend/src/index.ts             # auth-backend, guest provider, this module, catalog LDAP module
├── plugins/
│   ├── ldap-auth/
│   │   ├── src/plugin.ts                # createPlugin; LdapAuthFrontendPage alias
│   │   ├── src/components/LoginPage/    # LoginPage.tsx, Form.tsx, Identity.ts, types.ts (zod schema)
│   │   ├── dev/index.tsx                # createDevApp, page at /backstage-plugin-ldap
│   │   ├── app-config.yaml              # Upstream standalone config, not the workspace one
│   │   └── LICENSE                      # MIT, Immobiliare Labs
│   └── ldap-auth-backend/
│       ├── src/alpha.ts                 # createBackendModule, extension point, tokenValidatorRef
│       ├── src/provider.ts              # ProviderLdapAuthProvider (refresh/logout), ldap.create()
│       ├── src/config.ts                # resolveProviderConfig (environment ramps)
│       ├── src/ldap.ts                  # defaultLDAPAuthentication, defaultCheckUserExists
│       ├── src/jwt.ts                   # JWTTokenValidator (Keyv), TokenValidatorNoop
│       ├── src/auth.ts                  # defaultAuthHandler, defaultSigninResolver
│       └── LICENSE                      # MIT, Immobiliare Labs
├── examples/                            # create-app sample entities, org and template
├── app-config.yaml                      # auth.providers.ldap.development + catalog.providers.ldapOrg
├── app-config.production.yaml           # pg database; guest provider only
├── backstage.json                       # 1.49.2
├── Makefile                             # Static targets; *-dynamic targets only print a message
├── README.md                            # Hosting app: vkdr OpenLDAP setup, env vars, curl smoke test
├── AGENTS.md                            # This file
└── CLAUDE.md
```

No `docker-compose.yaml`, `dynamic-plugins.yaml` or `dynamic/` folder. The backend plugin has no `dev/` entry point.

## Commands

Standard `yarn` and `make` targets (root `AGENTS.md`). Specific to this workspace:

| Command | Purpose |
|---------|---------|
| `yarn start` | Hosting app; needs `LDAP_URL`, `LDAP_DN`, `LDAP_SECRET`, `LDAP_USERS_BASE_DN`, `LDAP_GROUPS_BASE_DN` exported (README) |
| `make build` | `yarn install && yarn tsc && yarn build:all` |
| `make pack` / `make publish` | `npm pack` / `npm publish --access public` per plugin; `publish` runs `build` first and skips versions already on the registry |
| `make build-dynamic` / `pack-dynamic` / `publish-dynamic` / `clean-dynamic` | Print "Dynamic plugins not supported in this workspace" and do nothing |
| `yarn update-backstage` | `versions:bump --pattern '@{backstage,roadiehq,backstage-community,veecode-platform}/*'` (see Gotchas) |
| `yarn test:e2e` | Playwright; `playwright.config.ts` starts `yarn start app` and `yarn start backend` unless `CI` is set |

## Architecture

### Request flow

1. `LdapSignInPage` mounts and calls `identity.fetch()`: `POST {auth base URL}/ldap/refresh` with `credentials: 'include'` and no body, to resume a session from the `backstage-token` cookie. On failure it renders `LoginForm`; on submit it posts `{ username, password }` to the same route. `discoveryApi.getBaseUrl('auth')` supplies the base URL and the `provider` prop the path segment.
2. `ProviderLdapAuthProvider.refresh` (POST only): with credentials it calls `ldapAuthentication` (default binds `<usernameAttribute>=<username>,<userSearchBase>` through `ldap-authentication`); with a cookie it validates the JWT (`tokenValidator.isValid`), takes the uid from `sub` and runs `checkUserExists`. Either way the old token is invalidated, `authHandler` builds the profile from the catalog (`ctx.findCatalogUser`), `signInResolver` calls `ctx.signInWithCatalogUser({ entityRef: uid })`, and the Backstage token is returned in the JSON body and set as an `httpOnly` cookie whose `maxAge` comes from the token's `exp`.
3. `logout` validates the cookie token, stores a logout timestamp for that `sub` and clears the cookie. `JWTTokenValidator.isValid` rejects any token whose `iat` predates the stored timestamp, so a refresh or logout invalidates every earlier token of that user.

### Extension points

- `ldapAuthExtensionPoint` (`id: 'ldap-auth-extension'`): another `auth` module calls `set({ authHandler, resolvers: { ldapAuthentication, checkUserExists }, signIn: { resolver }, tokenValidator })` to replace the defaults (`alpha.test.ts` shows the shape).
- `tokenValidatorRef` (plugin-scoped service, id `token-validator`): defaults to `new JWTTokenValidator(new Keyv())`, in memory. `tokenValidatorFactory({ createTokenValidator })` swaps the store; the backend README shows Keyv on PostgreSQL.

### Configuration

`resolveProviderConfig` (`config.ts`) reads the `auth.providers.ldap` subtree: `ldapAuthenticationOptions` declared directly wins; else the ramp named like `NODE_ENV`; else the only ramp present; else `production`, with a warning; else it throws, naming the ramps found. `cookies.field` defaults to `backstage-token` and `cookies.secure` to `false`. Neither package has a `config.d.ts` or a `configSchema`.

### Workspace dependencies

The two plugins do not depend on each other. The hosting app depends on them with `^1.0.0`, not `workspace:^`; `yarn.lock` resolves that range to the local packages.

## Testing

```pre
plugins/ldap-auth-backend/src/alpha.test.ts      # startTestBackend with the real @backstage/plugin-auth-backend + this module; supertest on /api/auth/ldap/refresh
plugins/ldap-auth-backend/src/provider.test.ts   # ProviderLdapAuthProvider with mocked req/res, resolver context and authenticate
plugins/ldap-auth-backend/src/ldap.test.ts       # defaultLDAPAuthentication / defaultCheckUserExists with a fake authenticate
plugins/ldap-auth-backend/src/jwt.test.ts        # JWTTokenValidator with in-memory Keyv and jest fake timers
plugins/ldap-auth-backend/src/config.test.ts     # resolveProviderConfig ramp resolution
plugins/ldap-auth/src/plugin.test.ts             # Plugin export only
packages/app/src/App.test.tsx                    # App renders
packages/app/e2e-tests/app.test.ts               # Playwright
```

Run `yarn test:all` from the workspace or `yarn test --watchAll=false` from a plugin (each plugin's `test:ci` is `--watch false`). The frontend has no component tests; `plugins/ldap-auth/src/setupTests.ts` loads `@testing-library/jest-dom` and `cross-fetch/polyfill`.

## Dynamic loading

Not applicable. Neither plugin has an `export-dynamic` script or a `dist-dynamic/` output, the Makefile's `*-dynamic` targets only print a message, and there is no container harness. The root `AGENTS.md` rule about proving dynamic artifacts on a DevPortal container does not apply; the plugins are consumed statically, as the hosting app does in `packages/app/src/App.tsx` and `packages/backend/src/index.ts`.

## Mocks and external dependencies

- External dependency: an LDAP server, needed by `yarn start` and by the login itself. Nothing in the workspace provides one: no compose file, no embedded server. `README.md` documents starting OpenLDAP with the `vkdr` CLI (`vkdr openldap install --ldap-admin`) and exporting the `LDAP_*` variables that `app-config.yaml` interpolates for both `auth.providers.ldap` and `catalog.providers.ldapOrg`.
- Tests never open an LDAP connection: `ldap.test.ts` and `provider.test.ts` pass a fake `authenticate` function, `alpha.test.ts` injects `resolvers.ldapAuthentication` through the extension point, and the token tests use an in-memory Keyv.
- `plugins/ldap-auth/dev/index.tsx` renders `LdapAuthFrontendPage` at `/backstage-plugin-ldap` with `createDevApp`; it still needs a running backend with the provider configured. There is no backend `dev/` entry point.

## Gotchas

- **License.** Both packages are `"license": "MIT"` and each folder carries the upstream `LICENSE` (Copyright (c) 2022 Immobiliare Labs); the rest of the repository is Apache-2.0. Keep those files, and do not add Apache headers to fork code.
- **Static only.** The root `AGENTS.md` lists this workspace as the static-only exception. Do not add `export-dynamic`, `dist-dynamic` or a harness without a decision.
- **Identifiers.** The frontend `createPlugin` id is `ldap-auth-frontend`, while its `package.json` `backstage.pluginId` says `ldap-auth`. The backend is a module, so its routes live under the auth plugin: `/api/auth/ldap/...`, from `providerId: 'ldap'`; the frontend's `provider="ldap"` prop must match it.
- **Backstage release.** `backstage.json` says 1.49.2 while the DevPortal host declares 1.52.0. Moving to the host line is planned in the planning repository; do not bump ad hoc. The `update-backstage` pattern here also includes `@veecode-platform/*`, so it touches the hosting app's ranges on these two plugins.
- **Undeclared imports.** `jsonwebtoken` is imported by `provider.test.ts` and `jwt.test.ts` but declared in no `package.json` of this workspace; `Identity.ts` imports `@backstage/errors`, which the frontend `package.json` does not list.
- **Stale e2e test.** `packages/app/e2e-tests/app.test.ts` clicks an `Enter` button (guest sign-in) and expects `My Company Catalog`; the hosting app renders the LDAP `Login` form instead.
- **Version drift.** The Makefile default `VERSION` differs from the `package.json` versions. `make set-version VERSION=x.y.z` rewrites both plugin manifests, then runs `yarn install`.
- **Frontend fetch.** `LdapSignInIdentity` uses the global `fetch` with `credentials: 'include'` on purpose (sign-in happens before `fetchApi` can inject a token); a test of it needs a fetch polyfill and a `discoveryApiRef` mock returning the `auth` base URL.
- **Config files.** `app-config.yaml` configures the provider under a `development` ramp. `app-config.production.yaml` adds only `guest` and a `pg` database; `packages/backend/Dockerfile` loads both files. `catalog-info.yaml` is the `create-app` placeholder (`owner: john@example.com`); do not fill it in ad hoc.

## Decisions

No `DECISIONS.md` in this workspace. If one is added, entries are plugin decision records (`PDR-NNN`), cited as `ldap-auth PDR-NNN`. Cross-workspace decisions are `plugins ADR-NNNN` in the planning repository `veecode-platform/devportal-plugins-parent`.
