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

## PDR-008: The login client action never reads or overwrites a value, and a tag shows which client a secret belongs to

**Status:** Accepted

**Context:** `aws:cognito:app-login-client:ensure` writes three secrets and must report that all
three already exist and match the client, or refuse. Matching the client ID by reading the secret
would need `GetSecretValue`, which the writer role does not have and the module avoids. Using
`writeSecret` would put a new version on a secret that exists and replace a value in place.

**Decision:** The action calls `CreateSecret` only, and its session policy has no `PutSecretValue`
and no `GetSecretValue`. Each secret it creates carries the tag `veecode.io/cognito-client-id`, and a
rerun compares that tag, read with `DescribeSecret`, with the ID of the client it found. A missing
or different tag refuses the run. It looks at the client list and at the three secrets before it
creates the client, so secrets with no client refuse the run before anything is created.

**Consequences:** Each Cognito call is sent once (`maxAttempts: 1`), as the Secrets Manager calls
are in PDR-001, so a retry cannot create a second client. The tag is only true while nothing else rewrites the value, so a host adds
`OAUTH2_PROXY_` to `reservedPrefixes`. Secrets written by hand before the action existed carry no
tag and are refused, not adopted. The values of the client secret and the cookie secret are never
compared, only the tag.

## PDR-009: Ownership of a login client follows the System, and the name alone does not grant it

**Status:** Accepted

**Context:** A template that creates an app runs the action before it publishes the repository, so
the System may not be in the catalog yet. A rule that required the System to exist would block the first
deploy; a rule that ignored it would let a user name another app and take its login client.

**Decision:** A System in the catalog must be owned by the caller, as for the register action. The
catalog is read with the plugin's own credentials, because a permission policy can hide a System
from a user who does not own it, and a System that is hidden from the user is not a System that
does not exist. The register action reads with the user's credentials and refuses what it cannot
see, so it fails closed and is unchanged. A
System that is not in the catalog may get a client only when no client of that name exists. A client
that exists needs the System in the catalog and owned by the caller, with one exception: the action
adopts the client when all three secrets exist and each is tagged with that client's ID and with
the same user, app and environment as this run, and the callback URL is this app's, so a rerun of a template that creates an app does not need the System
yet. Adopting reads no value, writes nothing and returns only the client ID. A System outside the `default`
namespace is refused unless `clientNamePattern` has `{namespace}`, for the reason of PDR-006. The
app and namespace names must be DNS labels, because the caller supplies them when the System is not
in the catalog and they end up in a host name and a client name.

**Consequences:** A run that ends after it created the client and before all three secrets were
written cannot be repeated while the System is not in the catalog: the client exists, the secrets are
not all in place, and the System does not exist. The client and the secrets it wrote have to be
removed by hand. A run that ended after all three were written can be repeated. Two first runs for one new app at the same moment can leave two clients of one
name, and the action refuses until one is removed. A caller can create clients for names of apps
that do not exist; the pool's limit on clients is the only bound, and the audit trail is the session
name and source identity of each run.

## PDR-010: The client settings are fixed in code

**Status:** Accepted

**Context:** A proven recipe sets the scopes, flows, token lifetimes and attributes of an app client.
`aws.cognito.signin.user.admin` lets a signed-in user change their own e-mail address, which the
login proxy trusts, so one mistaken setting would let a user become another.

**Decision:** The configuration takes the pool, the region, the URL and name patterns and the
identity providers, and nothing else. The block refuses unknown keys, so a `scopes` key stops the
backend at start. The cookie secret is 32 random bytes as URL-safe base64, the form oauth2-proxy
documents and decodes to 32 bytes.

**Consequences:** Changing the recipe is a code change with a test, not a setting. An existing client
is not checked against the recipe; a client changed by hand keeps its changes.

## PDR-011: Client names cannot collide, and a client is reused only for its own callback URL

**Status:** Accepted

**Context:** App names and environments both allow hyphens, so with `{app}-{environment}` the app
`a-b` in `c` and the app `a` in `b-c` would both be `a-b-c`. The second run would find the first
app's client and write its client secret under the second app's secret path.

**Decision:** The default pattern is `{app}.{environment}`, and the configuration refuses a pattern
whose neighbouring placeholders are not separated by one of `. _ + = , @`, which no app,
environment or namespace name contains. Before it reuses a client, the action also checks that the
client's only callback URL is this app's `<appUrl>/oauth2/callback`, and refuses otherwise with a
message that names no secret.

**Consequences:** A client someone changed by hand to add another callback URL is refused. The
callback URL check does not tell two apps apart when the URL pattern itself gives them the same
URL; that is a hosting conflict of its own.
