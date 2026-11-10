# aws-scaffolder

This workspace contains a `backend-plugin-module` for the scaffolder plugin
(`plugins/scaffolder-backend-module-aws-app-secrets`). It writes one secret of an app to AWS
Secrets Manager, lists the secrets an app declares, with whether each has a value, and gives an
app its own Cognito login client. The workspace also holds the dev shell needed to load the module
and prove it.

## Local flow

```bash
yarn install
yarn start
yarn dev:dynamic
```

`yarn dev:dynamic` exports the module locally. It does not publish or start Docker. It carries this
workspace's dynamic-plugin configuration into the ignored runner directory and prints the Compose
command to run in `devportal-local` for proof 2.

## Configuration

The module reads the `appSecrets` key once at start. A missing key, or a value that does not
parse, stops the backend before any action runs, and the error names the setting, for example
`appSecrets.writerRoleArn must be an IAM role ARN`.

| Key                | Meaning                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `region`           | Region of the secrets and of the writer role's session.                                                                  |
| `writerRoleArn`    | IAM role the portal assumes for every call. The only identity that writes.                                               |
| `pathPattern`      | Secret name pattern. Must contain `{app}`, `{environment}` and `{name}`; may contain `{cluster}`.                        |
| `cluster`          | Value of `{cluster}`. Required when the pattern uses it.                                                                 |
| `environments`     | Environments an app may register secrets for, such as `dev`.                                                             |
| `declarationFile`  | File in each component's folder that lists its secrets, containing `{environment}`. Default `config/{environment}.yaml`. |
| `reservedNames`    | Names no app may register. Use an empty list when there are none.                                                        |
| `reservedPrefixes` | Name prefixes no app may register. Use an empty list when there are none.                                                |
| `login`            | Optional block for the login client action, described under [App login clients](#app-login-clients).                     |

With the pattern above, the secret for the app `example-app`, environment `dev` and name
`DATABASE_PASSWORD` is `/example-cluster/apps/example-app/dev/DATABASE_PASSWORD`.

## Actions

### `aws:secrets-manager:app-secret:register`

A scaffolder action. Input: `app` (a System entity reference, such as `system:default/example-app`),
`environment`, `name`, and `valueSecret` (optional, default `value`). Output: `path`, `versionId`
and `created`.

The checks run in this order, and each refusal names its reason without the value:

1. The environment is configured.
2. The name is upper case letters, digits and underscores, it is not reserved, and it has no
   reserved prefix.
3. The caller is a user who owns the System. The owner and the caller's refs are compared in full
   form, so `group:example-team` and `group:default/example-team` match.
4. A Component of the System declares the name for the environment.
5. The task secret named by `valueSecret` holds a non-empty value.

The step then writes the secret: `CreateSecret`, or when the secret exists, `PutSecretValue` and
`TagResource`. Each secret carries the tags `veecode.io/registered-by`, `veecode.io/registered-at`,
`veecode.io/app` and `veecode.io/environment`.

### `aws:cognito:app-login-client:ensure`

A scaffolder action. See [App login clients](#app-login-clients).

### `list-app-secrets`

An actions-registry action. The registry keys it as `scaffolder:list-app-secrets`, from the plugin
id of the module.
Input: `app`. Output: `environments`, where each configured environment maps each declared name to
`{ hasValue, lastChangedDate? }`. It applies the same ownership check. It reads Secrets Manager
metadata with `DescribeSecret` only. A secret scheduled for deletion counts as having no value.

## App login clients

An app with a front piece runs oauth2-proxy in its pod against one Cognito user pool. Each app gets
its own app client in that pool, so a client can be revoked or inspected for one app alone. The
action `aws:cognito:app-login-client:ensure` creates that client and writes the three values the
proxy reads, with no human step.

Input: `app` (a System entity reference) and `environment` (optional, one of the configured
environments, default the first). Output: `clientId` (not secret), `created` (whether this run
created the client) and `secretNames`. The client secret and the cookie secret are never an input,
an output, a log line or an error message.

The block `appSecrets.login` turns it on. Without the block the action is registered and refuses to
run, with a message naming the missing setting.

| Key                 | Meaning                                                                                                                                                                                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `userPoolId`        | The user pool, as `<region>_<id>`. Required in the block. Its region must be the region of the block.                                                                                                                                                                                                             |
| `region`            | Region of the pool. Default `appSecrets.region`.                                                                                                                                                                                                                                                                  |
| `appUrlPattern`     | Where the app is served, such as `https://{app}.example.test`. https only, a bare origin. Must contain `{app}`; may contain `{environment}` and `{namespace}`.                                                                                                                                                    |
| `clientNamePattern` | Name of the client in the pool. Default `{app}.{environment}`. Must contain both; may contain `{namespace}`. Neighbouring placeholders must be separated by one of `. _ + = , @`, which no name contains: with `{app}-{environment}`, the app `a-b` in `c` and the app `a` in `b-c` would share the name `a-b-c`. |
| `identityProviders` | Identity providers the client signs in through. Default `["Google"]`.                                                                                                                                                                                                                                             |

The client is always created the same way, and nothing in the configuration changes it: the
authorization code flow only, the scopes `openid`, `email` and `profile`, read attributes `email`
and `email_verified`, write attribute `email`, a refresh token of 8 hours and access and ID tokens
of 60 minutes, refresh through the token only (`ALLOW_REFRESH_TOKEN_AUTH`), user existence errors
hidden, token revocation on, the callback URL `<appUrl>/oauth2/callback` and the sign-out URL
`<appUrl>/`. The scope `aws.cognito.signin.user.admin` is never requested, because it lets a user
change their own e-mail address and the proxy trusts that address. A `scopes` key, or any other key
the table does not list, stops the backend at start.

The three secrets sit at the same paths the register action uses, under the names
`OAUTH2_PROXY_CLIENT_ID`, `OAUTH2_PROXY_CLIENT_SECRET` and `OAUTH2_PROXY_COOKIE_SECRET`. The cookie
secret is 32 random bytes as URL-safe base64, the form the oauth2-proxy documentation generates;
the proxy decodes it back to 32 bytes. Standard base64 with `+` or `/` would be read as a raw
string of the wrong length. Each secret carries the registration tags and the tag
`veecode.io/cognito-client-id`, the ID of the client it was written for.

### Who may run it

- When the System is in the catalog, the caller must own it, the same rule as the register action.
  The action reads the catalog with the plugin's own credentials, so a System the user cannot see
  still counts as existing and still has to be owned by the user. (The register action reads it with
  the user's credentials and refuses a System the user cannot see.)
- When the System is not in the catalog yet, the action may create a client only if no client with
  that name exists. A template that creates an app can therefore run it before the repository is
  published, so the first deploy finds the values.
- When a client with that name exists, the System must be in the catalog and owned by the caller,
  so nobody takes over the login of another app by naming it. One exception lets a template that
  creates an app run the step again before the System reaches the catalog: the action adopts the
  client when all three secrets exist and each carries the tag `veecode.io/cognito-client-id` with
  the client's own ID, the tags `veecode.io/registered-by`, `veecode.io/app` and
  `veecode.io/environment` show that this same user wrote them for this app and environment, and the
  client's callback URL is this app's. Adopting writes nothing and
  reveals nothing. With any secret missing, tagged for another client, untagged, or scheduled for
  deletion, the run is refused.
- A System outside the `default` namespace is refused unless `clientNamePattern` has `{namespace}`,
  as it is for the secret path. Otherwise it would share a client with a System of the same name.
- The app and namespace names must be DNS labels, because they end up in the app's host name. When
  the System is not in the catalog, they come from the caller.

### What it does and refuses to do

The run looks first, then writes. It assumes the writer role once, lists the pool's clients by name
(following every page), and describes the three secrets. Then:

| Client in the pool             | Secrets                                                     | Result                                                                                             |
| ------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| none                           | none exist                                                  | creates the client, then the three secrets. `created` is true.                                     |
| none                           | some exist                                                  | refuses before creating anything.                                                                  |
| one, with another callback URL | any                                                         | refuses, naming no secret. The callback URL must be exactly this app's `<appUrl>/oauth2/callback`. |
| one, System not in the catalog | all exist, each tagged with the client's ID, by this user   | adopts the client, changes nothing, `created` is false.                                            |
| one, System not in the catalog | any other state, or written by another user                 | refuses.                                                                                           |
| one                            | all exist, each tagged with the client's ID                 | changes nothing, `created` is false.                                                               |
| one                            | some missing, the others tagged with the client's ID        | writes the missing ones, the client secret read back from Cognito.                                 |
| one                            | one exists without the client's ID tag, or is being deleted | refuses, naming the secret and no value.                                                           |
| more than one                  | any                                                         | refuses; remove the extra clients first.                                                           |

Nothing here overwrites a value: the action only calls `CreateSecret`, never `PutSecretValue`, and
it never reads a secret's value. The client ID tag is how a rerun sees that a value still belongs to
the client. Add `OAUTH2_PROXY_` to `reservedPrefixes`, so the register action cannot rewrite these
values and make the tag untrue.

If a write fails after the client was created, the step fails and says so. Run it again with the
System in the catalog and it writes the values still missing, without a second client.

If a write fails after the client was created and the System is not in the catalog yet, the rerun
is refused, because the three secrets are not all in place: the client and the secrets it wrote have
to be removed by hand. A rerun after all three secrets were written is adopted, whether a later
template step failed or the System has simply not been discovered yet. Two first runs for the same
new app at the same moment can leave two clients of one name; the action then refuses until one is
removed.

### Session policy

The action assumes the writer role with a session name `task-<task id>` and the user as source
identity, and narrows the session to the pool's client actions and to the three secrets:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cognito-idp:ListUserPoolClients",
        "cognito-idp:DescribeUserPoolClient",
        "cognito-idp:CreateUserPoolClient"
      ],
      "Resource": ["arn:aws:cognito-idp:<region>:*:userpool/<user pool id>"]
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:CreateSecret",
        "secretsmanager:DescribeSecret",
        "secretsmanager:TagResource"
      ],
      "Resource": [
        "arn:aws:secretsmanager:<region>:*:secret:<path of OAUTH2_PROXY_CLIENT_ID>-??????",
        "arn:aws:secretsmanager:<region>:*:secret:<path of OAUTH2_PROXY_CLIENT_SECRET>-??????",
        "arn:aws:secretsmanager:<region>:*:secret:<path of OAUTH2_PROXY_COOKIE_SECRET>-??????"
      ]
    }
  ]
}
```

### Template contract

```yaml
steps:
  - id: login-client
    name: Give the app its login client
    action: aws:cognito:app-login-client:ensure
    input:
      app: ${{ parameters.app }}
      environment: ${{ parameters.environment }}
```

## Declarations

A name is declared when a Component whose `relations.partOf` is the System lists it. The Component
is found through its `spec.system`, and its `backstage.io/managed-by-location` annotation (a `url:`
location) gives the folder the declaration file is read from. The declaration file is YAML:

```yaml
secrets:
  - DATABASE_PASSWORD
```

A file that does not exist declares nothing. A file that cannot be read or parsed fails the step
and names its URL.

## IAM

The portal's identity needs `sts:AssumeRole` and `sts:SetSourceIdentity` on the writer role. The
writer role needs these permissions on the app prefix:

- `secretsmanager:CreateSecret`
- `secretsmanager:PutSecretValue`
- `secretsmanager:TagResource`
- `secretsmanager:DescribeSecret`

on `arn:aws:secretsmanager:<region>:<account>:secret:/<cluster>/apps/*`. The writer role gets no
`secretsmanager:GetSecretValue`, `secretsmanager:ListSecrets` or `secretsmanager:DeleteSecret`.

For the login client action, the writer role also needs `cognito-idp:ListUserPoolClients`,
`cognito-idp:DescribeUserPoolClient` and `cognito-idp:CreateUserPoolClient` on the user pool in
`appSecrets.login`. It needs no `cognito-idp:UpdateUserPoolClient` or `cognito-idp:DeleteUserPoolClient`.

## Template contract

The template declares the value as a Secret field and names that field's key in `valueSecret`. The
value never reaches the step input.

```yaml
parameters:
  - title: Secret
    required: [app, environment, name, value]
    properties:
      app:
        title: App
        type: string
      environment:
        title: Environment
        type: string
      name:
        title: Name
        type: string
      value:
        title: Value
        type: string
        ui:field: Secret
steps:
  - id: register
    name: Register the secret
    action: aws:secrets-manager:app-secret:register
    input:
      app: ${{ parameters.app }}
      environment: ${{ parameters.environment }}
      name: ${{ parameters.name }}
      valueSecret: value
```

The field key is the value's key in the task secrets. Confirm that key against a running portal
before a template ships.

## Proof

Proof 1 is `yarn test:all`, which covers the configuration checks, each refusal, the create and
update paths, the failure paths, the session and identity values, the read action, and a sweep that
keeps the value out of every log line, output and error message. For the login client action it
also covers the create, rerun and half-finished-run paths, the ownership rule, the pool's pages, and
a sweep that keeps the client secret and the cookie secret out of every log line, output and error
message.

Not verified by this workspace: a real Secrets Manager prefix, the template's Secret field wiring,
the exposure of `list-app-secrets` in a running portal, whether Cognito rejects a second client of
the same name, and the login client action against a real user pool. Those belong to proof 2 and
the template work.
