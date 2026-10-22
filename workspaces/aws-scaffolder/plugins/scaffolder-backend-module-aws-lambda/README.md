# @veecode-platform/plugin-scaffolder-backend-module-aws-lambda

Scaffolder action `aws:lambda:invoke`. A template step invokes an AWS Lambda function through
an allowlisted target alias and can poll the function until its answer matches.

## Configuration

```yaml
aws:
  lambdaTargets:
    - alias: example-target
      roleArn: arn:aws:iam::123456789012:role/example-scaffolder-role
      functionArn: arn:aws:lambda:us-east-1:123456789012:function:example-function
      region: us-east-1
      externalId: example-external-id # optional
```

The module reads `aws.lambdaTargets` once, when it starts. Each entry accepts only the keys above.
`roleArn` must be an IAM role ARN and `functionArn` a Lambda function ARN. A malformed entry, an
unknown key, or a duplicate alias aborts the backend start, because the default
`backend.startup.default.onPluginModuleBootFailure` is `abort`. The startup error names the entry
index and alias, such as `aws.lambdaTargets[1] (alias "other-target"): entry Unrecognized key(s) in object: 'externalID'`.

## Allowlist rule

A template names a target by `alias`, never by ARN. An alias that is not listed under
`aws.lambdaTargets` is refused before any AWS call, and the error does not list the configured
aliases. Changing which function a template can reach is a configuration change, not a template
change.

## Authorization

The action authorizes nothing by itself. Any template that can run may name any alias listed under
`aws.lambdaTargets`, so the portal's permission framework has to decide who may execute
`aws:lambda:invoke` and with which `target`. The permission framework must be enabled
(`permission.enabled: true`).

Restrict it through the scaffolder action permission, `scaffolder.action.execute`, and its
conditional rules on the step input:

- `hasActionId` matches the action `aws:lambda:invoke`.
- `hasStringProperty` with `key: target` matches the alias that the group owns.

Bind each alias to the group that owns its target. Do not grant `scaffolder.action.execute`
without those conditions. A plain grant, such as `p, role:default/developer,
scaffolder.action.execute, use, allow` in an RBAC policy file, lets its holder invoke every configured alias.

The scaffolder evaluates the decision for each step of a template, with that step's rendered input.
A denied user's task therefore fails at the `aws:lambda:invoke` step with `NotAllowedError`, not when
the task is created. The rule must also pass the steps that are not `aws:lambda:invoke`. This
example gives the members of `group:default/example-owners` the alias `example-target` and passes
every other step. The policy reads the user's ownership through `coreServices.userInfo`, because the
`info` field of `PolicyQueryUser` is deprecated:

```ts
import type { UserInfoService } from '@backstage/backend-plugin-api';
import {
  AuthorizeResult,
  type PolicyDecision,
  isPermission,
} from '@backstage/plugin-permission-common';
import type {
  PermissionPolicy,
  PolicyQuery,
  PolicyQueryUser,
} from '@backstage/plugin-permission-node';
import { actionExecutePermission } from '@backstage/plugin-scaffolder-common/alpha';
import {
  createScaffolderActionConditionalDecision,
  scaffolderActionConditions,
} from '@backstage/plugin-scaffolder-backend/alpha';

export class ScaffolderPolicy implements PermissionPolicy {
  // Passed in from coreServices.userInfo when the policy is constructed.
  constructor(private readonly userInfo: UserInfoService) {}

  async handle(
    request: PolicyQuery,
    user?: PolicyQueryUser,
  ): Promise<PolicyDecision> {
    if (isPermission(request.permission, actionExecutePermission)) {
      const ownershipEntityRefs = user
        ? (await this.userInfo.getUserInfo(user.credentials))
            .ownershipEntityRefs
        : [];
      const ownsTarget = ownershipEntityRefs.includes(
        'group:default/example-owners',
      );
      return createScaffolderActionConditionalDecision(
        actionExecutePermission,
        {
          anyOf: [
            {
              not: scaffolderActionConditions.hasActionId({
                actionId: 'aws:lambda:invoke',
              }),
            },
            ...(ownsTarget
              ? [
                  scaffolderActionConditions.hasStringProperty({
                    key: 'target',
                    value: 'example-target',
                  }),
                ]
              : []),
          ],
        },
      );
    }
    // Your other permissions.
    return { result: AuthorizeResult.DENY };
  }
}
```

For a group that owns several aliases, add one `hasStringProperty` per alias.

## Action: `aws:lambda:invoke`

Input:

| Field     | Type   | Required | Meaning                                             |
| --------- | ------ | -------- | --------------------------------------------------- |
| `target`  | string | yes      | Alias of an entry in `aws.lambdaTargets`.           |
| `payload` | object | yes      | Sent to the function as its event.                  |
| `poll`    | object | no       | Repeats a payload until the answer matches (below). |

`poll`:

| Field             | Type                           | Meaning                                                                                                 |
| ----------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `payload`         | object                         | Sent on every poll.                                                                                     |
| `until`           | object with at least one key   | Top-level keys and values the answer must contain. Values are compared with deep equality.              |
| `intervalSeconds` | positive integer               | Seconds between polls. The first poll comes one interval after the first invoke.                        |
| `timeoutSeconds`  | positive integer, at most 3000 | Seconds, counted from the AssumeRole call, after which polling fails. The first invoke uses part of it. |

Output:

| Field        | Type   | Meaning                                                              |
| ------------ | ------ | -------------------------------------------------------------------- |
| `result`     | JSON   | Parsed answer of the function. With `poll`, the answer that matched. |
| `statusCode` | number | HTTP status of the invocation that produced `result`.                |

Behavior:

- Assumes `roleArn` with the portal's default credential chain (IRSA in the portal pod), sending
  `externalId` when it is configured. The assumed-role session is named `backstage-scaffolder-<task id>`,
  so CloudTrail ties each call to its task. The session lasts one hour, which is why `timeoutSeconds`
  is capped at 3000.
- Invokes `functionArn` synchronously (`RequestResponse`) at most once per call. The AWS SDK does not
  retry the invoke, so a network error after the call started fails the step and is not retried.
- Stops when the task is cancelled. A cancelled step fails with a message that says it was cancelled,
  and an invoke in flight is aborted.
- A function error fails the step with the function's `errorMessage`. When the error has no usable
  `errorMessage`, or its body is not JSON, the step fails with the error type only, such as
  `Lambda target 'example-target' failed: TypeError`. It never shows the raw body or the stack trace.
- A 200 answer whose payload is empty or not JSON fails the step with
  `Lambda target 'example-target' returned a response that is not JSON`.
- A failed role assumption or invocation fails the step with the AWS error name and message.
  Credentials never reach the task log.
- With `poll`, each answer is logged as one task-log line: the attempt, the elapsed seconds, the
  verdict, and the `until` keys with the value the answer returned for each, such as
  `Poll 3 at 30s: matched state="ready"`. A value is JSON-encoded, so strings are quoted and newlines
  or control characters are escaped; a value longer than 200 characters is clipped and ends with `…`.
  A key the answer lacks is logged as `<missing>`. Nothing else from the answer reaches the task log.

Example step:

```yaml
- id: wait-for-resource
  name: Wait for the resource
  action: aws:lambda:invoke
  input:
    target: example-target
    payload:
      action: create
      name: ${{ parameters.name }}
    poll:
      payload:
        action: status
        name: ${{ parameters.name }}
      until:
        state: ready
      intervalSeconds: 30
      timeoutSeconds: 1800
```
