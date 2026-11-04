# Workspace decisions

## PDR-001: Assume the writer role with an explicit STS call per action run

**Status:** Accepted

**Context:** Writes must go through a role separate from the portal's read-only identity, and
every write must show in CloudTrail under a session that names the task and the user.
`fromTemporaryCredentials` from `@aws-sdk/credential-providers` hides the STS call, so the tests
could not inspect the `RoleSessionName` and `SourceIdentity` they must check.

**Decision:** Each action run calls `AssumeRole` once through an `STSClient` on the default
credential chain. The session name is `task-<task id>` for the register action and
`list-app-secrets` for the read, and the source identity is the user's entity name. Both are
reduced to the characters STS accepts and cut to 64 characters. The run then builds one
`SecretsManagerClient` from the returned credentials.

**Consequences:** One session covers the whole run, which lasts far less than the default one-hour
session. The `SecretsManagerClient` sets `maxAttempts: 1`, so a write that AWS may already have
accepted is reported as failed and never sent twice.

## PDR-002: Test the clients with jest.mock, not aws-sdk-client-mock

**Status:** Accepted

**Context:** `aws-sdk-client-mock` 4.x types import `sinon`, and the `@types/sinon` line that
resolves beside it (17.x) references fake-timers types the tree does not provide. `@types/sinon`
22 fixes that, but it drops the named exports `aws-sdk-client-mock` imports. `tsc:full` runs with
`skipLibCheck false`, so either conflict fails the gate.

**Decision:** The tests replace `STSClient` and `SecretsManagerClient` with `jest.fn` send functions
and keep the real command classes. The mock inspects each command's `input`, and a test asserts
the command class it received.

## PDR-003: Stay on the 1.52.0 Backstage line while the host is on 1.54.9

**Status:** Accepted, to revisit when the template moves

**Context:** `devportal-core` declares `1.54.9` on `main`. The workspace template and the other
workspaces still declare `1.52.0`. ADR-0004 lets a workspace lag the host.

**Decision:** The workspace pins the template line, `1.52.0`, so it matches its siblings. The
template and `dummy` move first, as ADR-0004 §3 requires, before any workspace follows.

## PDR-004: The secret value comes only from the task secrets

**Status:** Accepted

**Context:** A value passed as an action input is stored with the task's parameters and returned
by the scaffolder's API. A value read from the task secrets stays out of both, so the template can
collect it without the input carrying it.

**Decision:** The register action reads `ctx.secrets[valueSecret]`, and `valueSecret` defaults to
`value`. Its input schema has no field for the value and refuses unknown keys
(`additionalProperties: false`). Every refusal and AWS error names the reason, never the value. A
test sweeps the log lines, outputs and error messages of each path for a marker value, and checks
that the marker does reach the `CreateSecret` input.

**Consequences:** A template must declare the value as a Secret field and name that field's key in
`valueSecret`. Whether the portal keeps the value anywhere else, such as the task row between its
creation and its claim, is a separate check that this workspace does not make.

## PDR-005: Create first, then put a new version and retag only when the secret exists

**Status:** Accepted

**Context:** An action that only calls `CreateSecret` ends a step successfully when the name
already exists, after logging the error. A changed value would look written while the old value
stays in place.

**Decision:** The action calls `CreateSecret`. Only on `ResourceExistsException` does it call
`PutSecretValue` and then `TagResource`. Any other error fails the step with the error name and the
secret path. A failed `TagResource` after `PutSecretValue` fails the step too.

**Consequences:** Tags belong to the secret, not to a version. After a failed `TagResource` the
step is reported as failed while the new version exists, and when two users register the same name
at the same time the last write wins. CloudTrail records each `PutSecretValue` with its session and
source identity.

## PDR-006: The System namespace is part of the secret's identity

**Status:** Accepted

**Context:** Two Systems in different catalog namespaces can share a name. A path built from the
name alone would let the owner of `system:team-a/billing` write the secrets of
`system:default/billing`.

**Decision:** `pathPattern` accepts `{namespace}`. When the pattern does not use it, both actions
refuse a System outside the `default` namespace, before any AWS call.

**Consequences:** A host that keeps every app in `default` needs no change. A host with apps in
other namespaces must put `{namespace}` in the pattern, and its IAM prefix follows.

## PDR-007: Narrow each writer session to the secrets the call names

**Status:** Accepted

**Context:** The writer role can write every secret under the app prefix. A bug in the checks
would let one run write another app's secret.

**Decision:** Each `AssumeRole` carries an inline session policy. The register action's session
allows only the secret it writes, as `<path>-??????`, the pattern AWS documents for a secret that
does not exist yet. The list action's session allows only `DescribeSecret` under each
environment's prefix of the app.

**Consequences:** A mistake in the checks cannot write outside the named secret. The pattern was
taken from the AWS documentation; the first run against a real account confirms it.
