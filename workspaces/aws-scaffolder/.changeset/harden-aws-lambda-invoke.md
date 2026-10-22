---
'@veecode-platform/plugin-scaffolder-backend-module-aws-lambda': minor
---

Harden `aws:lambda:invoke`: the invoke runs at most once per call, a cancelled task stops the step, error messages name the target without the raw body, poll logs are escaped and clipped, and malformed `aws.lambdaTargets` entries stop the backend at start.
