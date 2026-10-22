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

The module reads `aws.lambdaTargets` once, when it starts. A malformed entry or a duplicate
alias stops the module from starting.

## Allowlist rule

A template names a target by `alias`, never by ARN. An alias that is not listed under
`aws.lambdaTargets` is refused before any AWS call, and the error does not list the configured
aliases. Changing which function a template can reach is a configuration change, not a template
change.

## Authorization

The action authorizes nothing by itself. Any template that can run may name any alias listed under
`aws.lambdaTargets`, so the portal's permission framework has to decide who may execute
`aws:lambda:invoke` and with which `target`.

Restrict it through the scaffolder action permission, `scaffolder.action.execute`, and its
conditional rules on the step input:

- `hasActionId` matches the action `aws:lambda:invoke`.
- `hasStringProperty` with `key: target` matches the alias that the group owns.

Bind each alias to the group that owns its target. Do not grant `scaffolder.action.execute`
without those conditions. A plain grant, such as `p, role:default/developer,
scaffolder.action.execute, use, allow` in an RBAC policy file, lets its holder invoke every configured alias.

The scaffolder evaluates the decision against each step of a template, with that step's rendered
input. The rule must therefore also pass the steps that are not `aws:lambda:invoke`. This example
gives the members of `group:default/example-owners` the alias `example-target` and passes every
other step:

```ts
import { isPermission } from '@backstage/plugin-permission-common';
import { actionExecutePermission } from '@backstage/plugin-scaffolder-common/alpha';
import {
  createScaffolderActionConditionalDecision,
  scaffolderActionConditions,
} from '@backstage/plugin-scaffolder-backend/alpha';

// Inside the handle(request, user) method of your PermissionPolicy:
if (isPermission(request.permission, actionExecutePermission)) {
  const ownsTarget = user?.info.ownershipEntityRefs.includes(
    'group:default/example-owners',
  );
  return createScaffolderActionConditionalDecision(actionExecutePermission, {
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
  });
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

| Field             | Type                           | Meaning                                                                                    |
| ----------------- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| `payload`         | object                         | Sent on every poll.                                                                        |
| `until`           | object                         | Top-level keys and values the answer must contain. Values are compared with deep equality. |
| `intervalSeconds` | positive integer               | Seconds between polls. The first poll comes one interval after the first invoke.           |
| `timeoutSeconds`  | positive integer, at most 3000 | Polling fails when this many seconds pass without a match.                                 |

Output:

| Field        | Type   | Meaning                                                              |
| ------------ | ------ | -------------------------------------------------------------------- |
| `result`     | JSON   | Parsed answer of the function. With `poll`, the answer that matched. |
| `statusCode` | number | HTTP status of the invocation that produced `result`.                |

Behavior:

- Assumes `roleArn` with the portal's default credential chain (IRSA in the portal pod), sending
  `externalId` when it is configured. The assumed-role session lasts one hour, which is why
  `timeoutSeconds` is capped at 3000.
- Invokes `functionArn` synchronously (`RequestResponse`).
- A function error fails the step with the function's `errorMessage`.
- A failed role assumption or invocation fails the step with the AWS error name and message.
  Credentials never reach the task log.
- With `poll`, each answer is logged as one task-log line: the attempt, the elapsed seconds, the
  verdict, and the `until` keys with the value the answer returned for each, such as
  `Poll 3 at 30s: matched state=ready`. A key the answer lacks is logged as `<missing>`. Nothing
  else from the answer reaches the task log.

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
