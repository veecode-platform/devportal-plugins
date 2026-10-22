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

## Action: `aws:lambda:invoke`

Input:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `target` | string | yes | Alias of an entry in `aws.lambdaTargets`. |
| `payload` | object | yes | Sent to the function as its event. |
| `poll` | object | no | Repeats a payload until the answer matches (below). |

`poll`:

| Field | Type | Meaning |
| --- | --- | --- |
| `payload` | object | Sent on every poll. |
| `until` | object | Top-level keys and values the answer must contain. Values are compared with deep equality. |
| `intervalSeconds` | positive integer | Seconds between polls. The first poll comes one interval after the first invoke. |
| `timeoutSeconds` | positive integer, at most 3000 | Polling fails when this many seconds pass without a match. |

Output:

| Field | Type | Meaning |
| --- | --- | --- |
| `result` | JSON | Parsed answer of the function. With `poll`, the answer that matched. |
| `statusCode` | number | HTTP status of the invocation that produced `result`. |

Behavior:

- Assumes `roleArn` with the portal's default credential chain (IRSA in the portal pod), sending
  `externalId` when it is configured. The assumed-role session lasts one hour, which is why
  `timeoutSeconds` is capped at 3000.
- Invokes `functionArn` synchronously (`RequestResponse`).
- A function error fails the step with the function's `errorMessage`.
- A failed role assumption or invocation fails the step with the AWS error name and message.
  Credentials never reach the task log.
- With `poll`, each answer is logged as one task-log line with the elapsed seconds and whether
  it matched.

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
