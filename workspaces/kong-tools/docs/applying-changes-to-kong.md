# Applying changes to Kong: pick the path that matches your setup

This plugin lets developers manage Kong from the portal: create routes and enable, configure or
remove Kong plugins on a service. Whether those changes can be applied **directly**, and whether
they **stay applied**, depends entirely on how your team runs Kong. This guide explains the two
paths the plugin supports and how to choose. It assumes no prior knowledge of Kong's operating
modes.

A deliberate product decision: the plugin supports both paths and does not enforce either.
The team deploying the portal should read this page and recommend one path for its own
context. (Recorded internally as plugins ADR-0005.)

## First: how do you run Kong?

Kong stores its configuration (routes, services, plugins) in one of two ways, and everything
else follows from this:

| How Kong runs | How configuration gets in | What this plugin can do |
|---|---|---|
| **With a database** ("db-backed": Kong + PostgreSQL, standalone or hybrid) | Kong's management REST API (the **Admin API**) accepts create/update/delete calls | Full functionality: every action in the portal UI is applied immediately |
| **Without a database** ("db-less": common when Kong is a Kubernetes ingress controller) | An automated process pushes the complete configuration, generated from files or Kubernetes resources kept in Git | Read-only today: the portal shows routes and plugins, but Kong itself rejects direct writes in this mode. Applying changes from the portal will be possible through the export path (roadmap) |

Not sure which one you run? Call the root of your Admin API (`GET /`) and check the
`configuration.database` field: `postgres` means db-backed, `off` means db-less.

## The two paths

### Path 1 — the portal writes directly to Kong

The plugin backend calls the Admin API. Changes apply within seconds and are visible to traffic
immediately. Requirements:

- Kong running **with a database**.
- Network access from the portal backend to the Admin API (see
  [Protecting the Admin API](#protecting-the-admin-api) below).

This is the path to pick when your team manages Kong by hand or wants the portal to be the
main interface for day-to-day gateway changes.

### Path 2 — the portal produces configuration files (roadmap)

Instead of writing to Kong, the portal exports the change as declarative artifacts — Kubernetes
resources (for Kong's Ingress Controller) or configuration files (for decK) — that your
existing automation reviews and applies. Kong itself stays untouched by the portal.

This is the path for teams that manage Kong from Git ("GitOps"): the files in Git remain the
single source of truth, and portal changes go through the same review pipeline as any other
change. The trade-off is speed: a change is only live after your pipeline applies it.

## Using both: experiment first, make it permanent after

The two paths combine into a workflow rather than a fork:

1. A developer **experiments from the portal** (path 1): enables a rate limit on a route, tests
   it against real traffic, adjusts values — feedback in seconds.
2. Once satisfied, they **export the validated change** as configuration files (path 2) and
   merge them into the Git repository that owns Kong's configuration.
3. The temporary change created during the experiment is **removed** when the exported version
   lands — otherwise the same route or plugin would exist twice and conflict.

This requires a Kong with a database for the experimentation surface. That gateway does not
have to be your production one: a dedicated db-backed Kong for experiments, with production
staying fully Git-managed, is a valid setup.

## Keeping the portal and your automation out of each other's way

If an automated process also writes to the same Kong (for example Kong's Ingress Controller on
a db-backed cluster, or scheduled decK syncs), two writers share one gateway. Kong's ecosystem
handles this with **tags**:

- Set `kong.instances[].defaultTags` (for example `["devportal-managed"]`) and everything this
  plugin creates through that instance carries those tags automatically — callers don't have to
  remember them. There is no built-in default: without the setting, entities are created exactly
  as submitted.
- Kong's Ingress Controller only manages entities carrying **its** tag
  (`managed-by-ingress-controller` by default) and leaves everything else alone.
- decK does the same when configured with `select_tags` — see
  [Kong's federated configuration guide](https://developer.konghq.com/deck/apiops/federated-configuration/).

One honest caveat: this is a **convention, not a lock**. Kong has no concept of entity
ownership, so an automation configured without tag scoping can still remove portal-created
entities, and a route created from the portal can still collide by name or path with one
defined in Git. Make sure every writer on the gateway scopes itself by tags.

## Protecting the Admin API

The Admin API is the full management surface of your gateway. In Kong's open-source edition it
has **no built-in authentication**, so:

- Never expose it on the internet. Keep it as an internal service (in Kubernetes, a
  ClusterIP service reachable only inside the cluster).
- The portal backend should reach it through that internal address — configure it in
  `kong.instances[].apiBaseUrl`.
- For human access (including Kong Manager, the built-in web UI), use `kubectl port-forward`
  to ports 8001 (Admin API) and 8002 (Kong Manager) instead of creating a public route.
- If you need more than network isolation, Kong supports putting the Admin API itself behind
  the gateway with an authentication plugin — see
  [Kong's guide on securing the Admin API](https://developer.konghq.com/gateway/secure-the-admin-api/).

## Choosing quickly

| Your situation | Suggested path |
|---|---|
| Kong with a database, changes made by people | Path 1 (direct) |
| Kong db-less behind an ingress controller, configuration in Git | Read-only today; path 2 (export) when available |
| Configuration in Git, but developers need to try things quickly | Both: experiment on a db-backed Kong (path 1), promote to Git (path 2) |
| Multiple teams/tools writing to one gateway | Whatever the path: enforce tag scoping on every writer |
