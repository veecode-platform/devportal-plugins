# AGENTS.md — global-header workspace

Agent context for this workspace. Repository-wide rules are in the root [`AGENTS.md`](../../AGENTS.md); the section order follows the template in [`workspaces/dummy/AGENTS.md`](../dummy/AGENTS.md).

## What the plugins do

One frontend plugin that renders the VeeCode DevPortal global header: a sticky MUI `AppBar` whose contents are a priority-sorted list of mount points (company logo, search, create/starred/application-launcher/help/profile dropdowns, notification button, theme toggle, spacer, divider).

- `plugins/veecode-global-header` — `@veecode-platform/plugin-veecode-global-header`, frontend, `id: 'global-header'` in `createPlugin`, `backstage.pluginId: veecode-global-header` in `package.json`. Exports `GlobalHeader` (reads its mount points from Scalprum, for dynamic loading), `GlobalHeaderComponent` (takes `globalHeaderMountPoints` as a prop, for static wiring), one `createComponentExtension` per building block (`CompanyLogo`, `SearchComponent`, `Spacer`, `Divider`, `HeaderButton`, `HeaderIcon`, `HeaderIconButton`, `ToggleThemeButton`, `CreateDropdown`, `StarredDropdown`, `ApplicationLauncherDropdown`, `HelpDropdown`, `ProfileDropdown`, `SoftwareTemplatesSection`, `RegisterAComponentSection`, `MenuItemLink`, `LogoutButton`, `SupportButton`, `NotificationButton`, `NotificationBanner`), `defaultGlobalHeaderComponentsMountPoints`, the mount point types, and the translation resource `globalHeaderTranslations` (de, es, fr, it, pt; re-exported through `src/alpha.ts`).

The hosting app (`packages/app`, `packages/backend`) wires the header statically in `Root.tsx` and is not published.

## Layout

Standard shape (see the root `AGENTS.md`), plus:

```pre
workspaces/global-header/
├── packages/
│   ├── app/src/components/Root/Root.tsx          # GlobalHeaderComponent above the sidebar; RHDH layout wrappers
│   ├── app/src/components/toolbox/BackstageIcons.tsx  # "Show icons" page at /toolbox#list-icons
│   └── backend/src/index.ts                      # create-app backend + notifications, signals, search, kubernetes
├── plugins/veecode-global-header/
│   ├── src/plugin.ts                             # createPlugin + createComponentExtension for every export
│   ├── src/index.ts                              # MUI ClassNameGenerator prefix, re-exports plugin.ts and alpha.ts
│   ├── src/types.ts                              # Mount point types; ScalprumState names the five mount points
│   ├── src/defaultMountPoints/defaultMountPoints.tsx  # default*MountPoints arrays (static defaults)
│   ├── src/components/                           # One folder per component; GlobalHeader*.tsx at the top
│   ├── src/hooks/                                # use*MountPoints (Scalprum), useNotificationCount, useTranslation, ...
│   ├── src/translations/                         # ref.ts (English messages) + de, es, fr, it, pt
│   ├── src/test-utils/mockTranslations.ts        # mockUseTranslation, MockTrans
│   ├── dev/index.tsx                             # Standalone dev app, four pages
│   ├── config.d.ts                               # app.branding.fullLogo, fullLogoWidth, app.support.url
│   ├── app-config.dynamic.yaml                   # Reference dynamicPlugins snippet, shipped in the npm package
│   ├── report.api.md                             # Generated API Extractor report
│   └── README.md                                 # Consumer docs (shown on npm)
├── examples/                                     # create-app catalog samples referenced by app-config.yaml
├── backstage.json                                # 1.49.2
├── catalog-info.yaml                             # create-app placeholder
├── playwright.config.ts
├── Makefile
├── README.md
├── AGENTS.md                                     # This file
└── CLAUDE.md
```

No `docker-compose.yaml`, `dynamic-plugins.yaml` or `dynamic/` folder: this workspace has no container harness.

## Commands

Standard `yarn` and `make` targets (root `AGENTS.md`). `yarn test:e2e` runs Playwright; `playwright.config.ts` starts `yarn start app` and `yarn start backend` itself unless `CI` is set. Specific to this workspace:

| Command | Purpose |
|---------|---------|
| `make build-dynamic` | `make build`, then delete module-federation leftovers from the plugin `dist/` and run `npx @red-hat-developer-hub/cli@latest plugin export` |
| `yarn build-dynamic-plugin` (from the plugin) | The same export without the cleanup step |
| `make pack-dynamic` / `make publish-dynamic` | `npm pack` / `npm publish` from `plugins/veecode-global-header/dist-dynamic/` |
| `make set-version VERSION=x.y.z` | Rewrite the plugin `package.json` version, then `yarn install` |
| `make copy-dynamic-plugins` (repository root) | Copy this plugin's `dist-dynamic/` to `$(DYNAMIC_PLUGIN_ROOT)/veecode-platform-plugin-veecode-global-header-dynamic` |

## Architecture

- **Mount points.** `GlobalHeaderComponent` drops entries whose `config.priority` is below 0, sorts the rest descending by priority (higher is further left) and renders each `Component` inside an `ErrorBoundary` with `config.props` and `config.layout`. `GlobalHeader` gets the list from `useScalprum().api.dynamicRootConfig.mountPoints['global.header/component']` (`hooks/useGlobalHeaderMountPoints.ts`); the dropdowns read `global.header/create`, `global.header/profile`, `global.header/help` and `global.header/application-launcher` the same way (`src/types.ts`, `hooks/use*DropdownMountPoints.ts`). Statically, `Root.tsx` passes `defaultGlobalHeaderComponentsMountPoints` as a prop.
- **Configuration.** `CompanyLogo` reads `app.branding.fullLogo` (string or `{ light, dark }`), `app.branding.fullLogoDark` and `app.branding.fullLogoWidth`, and falls back to the VeeCode logo (`DefaultVeeCodeLogo.tsx`). `SupportButton` renders nothing unless `to` or `app.support.url` is set. `config.d.ts` declares `fullLogo`, `fullLogoWidth` and `support.url`.
- **Icons by name.** `HeaderIcon` resolves `icon` through `useApp().getSystemIcon()`, then inline `<svg`, then a URL, then an icon-font name. `MenuItemLink` items can use `type` (`doc`, `user`, `settings`, `extension`, `support`, ...) via `RenderIconByType`. The hosting app registers extra icons (`logout`, `profile`, `person`, `category`) in `App.tsx`; its `/toolbox#list-icons` page lists every registered icon.
- **Notifications.** `useNotificationCount` reads `notificationsApiRef` through `useApiHolder()`, so `NotificationButton` hides when the notifications plugin is absent, and updates the badge from `useSignal('notifications')`.
- **i18n.** `useTranslation` wraps `useTranslationRef(globalHeaderTranslationRef)`. The plugin registers the resource in `createPlugin` (`__experimentalTranslations`) and the hosting app registers it again in `createApp` (`App.tsx`). `app-config.yaml` exposes `en` and `pt` in `i18n.locales`.
- **Theme.** `GlobalHeaderComponent` and `useAppBarBackgroundScheme` read the `rhdh` palette extension (`@red-hat-developer-hub/backstage-plugin-theme`) when present and fall back to MUI palette values.
- Legacy frontend system only (`createPlugin`, `createComponentExtension`); no routable extension, no routes.

## Testing

Jest + `@testing-library/react` + `@backstage/test-utils` (`renderInTestApp`, `TestApiProvider`, `mockApis.config`); `src/setupTests.ts` loads `@testing-library/jest-dom`. Playwright projects come from `@backstage/e2e-test-utils` `generateProjects()`. No backend plugin, so no `startTestBackend`.

```pre
plugins/veecode-global-header/src/plugin.test.ts        # Plugin export check
plugins/veecode-global-header/src/utils/stringUtils.test.tsx
plugins/veecode-global-header/src/components/**/*.test.tsx  # 15 files: HeaderButton, Spacer, Divider, SupportButton,
                                                        #   NotificationButton, SearchComponent/* (5), HeaderDropdownComponent/* (5)
packages/app/src/App.test.tsx                           # App renders
packages/app/e2e-tests/app.test.ts                      # Playwright smoke: guest "Enter", then "My Company Catalog"
```

Patterns: components that translate mock `../../hooks/useTranslation` with `mockUseTranslation` and `../../components/Trans` with `MockTrans` from `src/test-utils/mockTranslations.ts` (English messages from `translations/ref.ts`, flattened to dot keys). Dropdown tests mock their `use*DropdownMountPoints` hook to inject entries. `NotificationButton.test.tsx` mocks `useNotificationCount`. `SearchComponent.test.tsx` provides `searchApiRef` and `configApiRef` and wraps in `SearchContextProvider`.

Run `yarn test:all` from the workspace or `yarn test --watchAll=false` from the plugin. No GitHub workflow runs these suites.

## Dynamic loading

There is no container harness here. `make build-dynamic` produces `plugins/veecode-global-header/dist-dynamic/`; the root Makefile's `make copy-dynamic-plugins` copies it into `DYNAMIC_PLUGIN_ROOT` (default `$(DEVPORTAL_BASE_PATH)/dynamic-plugins-root`, override `DEVPORTAL_BASE_PATH` to point at a local DevPortal checkout). Which harness this workspace adopts is decided in the planning repository.

`plugins/veecode-global-header/app-config.dynamic.yaml` is the reference `dynamicPlugins.frontend` snippet under the key `veecode-platform.plugin-veecode-global-header`: it mounts `GlobalHeader` at `application/header` with `position: above-sidebar`, lists the header components on `global.header/component` with their priorities, and adds `MenuItemLink`, `SupportButton` and `LogoutButton` entries on `global.header/application-launcher`, `global.header/help` and `global.header/profile`. It also blanks `default.main-menu-items.menuItems.default.create.title`. The file ships in the npm package (`files` in `package.json`).

## Mocks and external dependencies

- No backend of its own and no external service. At runtime it consumes other plugins' APIs: `notificationsApiRef` and `useSignal` (notifications badge), `searchApiRef` / `SearchContextProvider` (search), `catalogApiRef` and `starredEntitiesApiRef` (starred and create dropdowns), `useUserProfile` from `@backstage/plugin-user-settings` (profile), `identityApiRef.signOut()` (`LogoutButton`). The hosting backend adds notifications, signals, search (pg engine module, catalog and techdocs collators) and kubernetes so the header has live data.
- `dev/index.tsx` uses `createDevApp` with a `TestApiProvider` (`catalogApiMock`, `MockStarredEntitiesApi`, `MockSearchApi`, `mockApis.config`, a `NotificationsClient` over `MockFetchApi`) and a hand-built `ScalprumContext` so `GlobalHeader` finds its mount points. Pages: `/default-header`, `/header-without-search`, `/header-buttons`, `/notifications`.
- `app-config.yaml` enables the guest provider (`dangerouslyAllowOutsideDevelopment`) and a static external-access token (`mysecrettoken`), which the plugin README's `curl` example uses to post a notification to `/api/notifications/notifications`.

## Gotchas

- The dynamic export script is `build-dynamic-plugin` (`npx @red-hat-developer-hub/cli@latest plugin export`), not `export-dynamic` as in dummy. The root Makefile's `copy-dynamic-plugins` target looks for this plugin's `dist-dynamic/` folder; keep that name.
- `make build-dynamic` deletes `remoteEntry.js`, `mf-manifest.json`, `mf-stats.json`, `@mf-types` and `compiled-types` from `dist/` before exporting; `yarn build-dynamic-plugin` alone does not.
- `backstage.json` says 1.49.2 while the DevPortal host declares 1.52.0 (plugins ADR-0004). Moving to the host line is planned in the planning repository; do not bump ad hoc. The plugin's `backstage.supported-versions` in `package.json` reads 1.43.1, a third value.
- Three identifiers, each with its own place: `id: 'global-header'` (`createPlugin`), `pluginId: veecode-global-header` (`package.json`), `veecode-platform.plugin-veecode-global-header` (the `dynamicPlugins` key and the `dist-dynamic` folder name).
- `defaultGlobalHeaderComponentsMountPoints` (static default) and `app-config.dynamic.yaml` (dynamic default) differ: the static list uses `CreateDropdown` and links the logo to `/catalog`; the YAML uses `HeaderIconButton` to `create` and links the logo to `/`. Change both when changing the default header.
- `src/index.ts` configures MUI's `ClassNameGenerator` to prefix every class with `v5-` as a side effect of importing the package.
- `CompanyLogo.tsx` imports `useThemeCurrent` through the package's own name (`@veecode-platform/plugin-veecode-global-header/src/hooks`); every other file uses relative imports.
- `report.api.md` is generated and still titled for `@red-hat-developer-hub/backstage-plugin-global-header`; the source files carry Red Hat's Apache-2.0 header, and `CompanyLogo.tsx` records the VeeCode modification.
- The plugin README points at `scripts/send-notification.sh`; there is no `scripts/` directory in this workspace. The `curl` example in the same README does work against the hosting app.
- `catalog-info.yaml` is the `create-app` placeholder, with `metadata.name: homepage` and `owner: john@example.com`. Its fate is decided by standard 01 in the planning repository; do not fill it in ad hoc.

## Decisions

No `DECISIONS.md` in this workspace. If one is added, entries are plugin decision records (`PDR-NNN`), cited as `global-header PDR-NNN`. Cross-workspace decisions are `plugins ADR-NNNN` in the planning repository `veecode-platform/devportal-plugins-parent`.
