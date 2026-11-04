# aws-scaffolder

This workspace contains a `backend-plugin-module` for the scaffolder plugin
(`plugins/scaffolder-backend-module-aws-app-secrets`). It writes one secret of an app to AWS
Secrets Manager and lists the secrets an app declares, with whether each has a value. The
workspace also holds the dev shell needed to load the module and prove it.

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

### `list-app-secrets`

An actions-registry action. The registry keys it as `scaffolder:list-app-secrets`, from the plugin
id of the module.
Input: `app`. Output: `environments`, where each configured environment maps each declared name to
`{ hasValue, lastChangedDate? }`. It applies the same ownership check. It reads Secrets Manager
metadata with `DescribeSecret` only. A secret scheduled for deletion counts as having no value.

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
keeps the value out of every log line, output and error message.

Not verified by this workspace: a real Secrets Manager prefix, the template's Secret field wiring,
and the exposure of `list-app-secrets` in a running portal. Those belong to proof 2 and the
template work.
