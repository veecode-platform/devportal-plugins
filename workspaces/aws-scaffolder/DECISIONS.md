# Workspace decisions

## PDR-001: Assume the target role with an explicit STS call per step

**Status:** Accepted

**Context:** The module needs temporary credentials for `roleArn` and must send `ExternalId`
when a target configures one. `fromTemporaryCredentials` from `@aws-sdk/credential-providers`
hides the STS call, so the tests could not inspect the `ExternalId` they must check.

**Decision:** Each step calls `AssumeRole` once through an `STSClient` on the default credential
chain, then builds one `LambdaClient` from the returned credentials. A poll loop reuses that
client. `timeoutSeconds` is capped at 3000 so that every poll finishes inside the one-hour session.

**Consequences:** A poll cannot outlive its session. Raising the cap needs a refresh of the
credentials inside the loop.

## PDR-002: Test the clients with jest.mock, not aws-sdk-client-mock

**Status:** Accepted

**Context:** `aws-sdk-client-mock` 4.x types import `sinon`, and the `@types/sinon` line that
resolves beside it (17.x) references fake-timers types the tree does not provide. `@types/sinon`
22 fixes that, but it drops the named exports `aws-sdk-client-mock` imports. `tsc:full` runs with
`skipLibCheck false`, so either conflict fails the gate.

**Decision:** The tests replace `STSClient` and `LambdaClient` with `jest.fn` send functions and
keep the real command classes. The mock inspects each command's `input`.

## PDR-003: Stay on the 1.52.0 Backstage line while the host is on 1.54.9

**Status:** Accepted, to revisit when the template moves

**Context:** `devportal-core` declares `1.54.9` on `main`. The workspace template and the other
workspaces still declare `1.52.0`. ADR-0004 lets a workspace lag the host.

**Decision:** The workspace pins the template line, `1.52.0`, so it matches its siblings. The
template and `dummy` move first, as ADR-0004 §3 requires, before any workspace follows.
