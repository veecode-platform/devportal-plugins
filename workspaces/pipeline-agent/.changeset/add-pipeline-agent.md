---
'@veecode-platform/backstage-plugin-pipeline-agent': minor
'@veecode-platform/backstage-plugin-pipeline-agent-backend': minor
'@veecode-platform/backstage-plugin-pipeline-agent-common': minor
---

Add the pipeline agent packages: an entity card that investigates a failed GitLab
pipeline on entities that opt in, and waits for approval before it opens a merge
request; the backend routes behind the catalog permissions and the project bindings,
with a fake mode that runs without external services; and the file handover, which
gives the agent the sanitized job log, the commit diff and the repository archive as
files under `/mnt/session/uploads/pipeline/`. The common package holds the HTTP
contract both sides use.
