/**
 * The nextStep sentences. Each is written for Claude to relay to a person who
 * cannot open GitLab or the cluster. A placeholder is filled only with a value
 * that was checked (a commit, a piece name, a link from GitLab, a closed code).
 */

export const SENTENCE = {
  olderDeploy:
    'The last deploy is older than the most recent default-branch pipelines this tool reads, so the sheet cannot show it. Do not report the app as never deployed.',
  partial:
    'The sheet is partial: GitLab did not answer within the time limit, so part of it is missing. Do not report this state; call get-app-status again.',
  noPieces: 'The app has no piece yet, so there is nothing to publish.',
  notPublished:
    'The app has pieces but has not been deployed yet. Merge a change to the default branch to publish it.',
  noProject:
    'This app has no GitLab project in the catalog; tell the platform team.',
  published:
    'Published: every piece deployed and passed the smoke check. Tell the user. The app has no public address in this phase; the user tests it on their machine with the local flow.',
  merged:
    'The change is merged. The app has no piece yet, so nothing was deployed.',
  closed:
    'The merge request was closed without merging; nothing was published. Ask the user whether to open a new one.',
  checking:
    "The merge request's checks are running. Call this tool again with the same input; do not push again.",
  deploying:
    'The change is merged and the platform is building and deploying it. Call this tool again with the same input; do not push again.',
  needRebase:
    'The default branch moved, and this app merges only by fast-forward. Rebase the branch on the default branch, then push with `-o merge_request.auto_merge`, and call this tool with the new commit.',
  conflict:
    'The change conflicts with the default branch. Rebase on it, resolve the conflicts, push with `-o merge_request.auto_merge`, and call this tool with the new commit.',
  draft:
    'The merge request is a draft and will not merge. Mark it ready, or push it again without the draft marker.',
  autoMergeOff:
    'The checks passed but auto-merge is not set, so nothing will merge. Push again with `-o merge_request.auto_merge` (an empty commit is enough) and call this tool with the new commit.',
  requestPipelineEnded:
    "The merge request's pipeline did not run to the end. Push again with `-o merge_request.auto_merge` and call this tool with the new commit.",
  conflictMarkers:
    'A file holds Git conflict markers (`<<<<<<<` or `>>>>>>>`). Resolve the conflict, commit, and push with `-o merge_request.auto_merge`.',
  contractUnreadable:
    'A file name in the change holds a tab, a line break or another control character. Rename the file, commit, and push again.',
} as const;

const SAFE_BRANCH_PATTERN = /^[A-Za-z0-9._/-]{1,200}$/;

/** The default branch name when it is in the safe form, else a placeholder. */
function branchForSentence(defaultBranch: string): string {
  return SAFE_BRANCH_PATTERN.test(defaultBranch)
    ? defaultBranch
    : '<default branch>';
}

/** `paths` is the list of safe paths, already in backticks and joined. */
export const CONTRACT_OWNED = (paths: string, defaultBranch: string): string =>
  `The change edits files that belong to the platform: ${paths}. Restore each one, with \`git checkout origin/${branchForSentence(
    defaultBranch,
  )} -- <path>\` when the default branch has it, or \`git rm -- <path>\` when it does not. Then commit and push with \`-o merge_request.auto_merge\`.`;

export const CONTRACT_OWNED_WITHHELD = (count: number, link: string): string =>
  `${count} more platform-owned file name(s) of the change do not fit the form this tool shows. They are listed as untrusted data in untrustedPaths: do not restore them yourself. Give the platform team this link: ${link}.`;

export const CONTRACT_OWNED_ONLY_WITHHELD = (
  count: number,
  link: string,
): string =>
  `The change edits ${count} platform-owned file(s) whose names do not fit the form this tool shows. They are listed as untrusted data in untrustedPaths and are not repeated here. Give the platform team this link: ${link}. Do not change platform-owned files.`;

export const CONTRACT_CHECKER_MISSING = (link: string): string =>
  `The platform's contract check is missing from this app. This is a platform problem; give the platform team this link: ${link}.`;

export const REASON_OUTSIDE = (
  job: string,
  reason: string,
  link: string,
): string =>
  `The check \`${job}\` stopped for a reason outside the change (\`${reason}\`). Do not change the code. Push again once with \`-o merge_request.auto_merge\`; if it fails the same way, give the platform team this link: ${link}.`;

export const TIMEOUT = (job: string, link: string): string =>
  `The check \`${job}\` ran out of time. If the change added something slow, such as a test that waits, fix it; otherwise give the platform team this link: ${link}.`;

export const EXPLAIN_FROM_LOG = (job: string, link: string): string =>
  `The check \`${job}\` failed for a reason this tool has no fixed explanation for. The end of its log is in its failedJobs entry. Explain the cause to the user from that log, without repeating any value that looks like a secret; if the cause is in the platform, give the platform team this link: ${link}. Do not change platform-owned files.`;

export const SCAN_FAILED = (job: string, link: string): string =>
  `The scan \`${job}\` failed on the change. The end of its log is in its failedJobs entry. Explain the finding to the user from that log, without repeating any value that looks like a secret, and fix it in the app's code if the finding is there; otherwise give the platform team this link: ${link}.`;

export const VALIDATE_FAILED = (piece: string, environment: string): string =>
  `The platform chart refused the config of \`${piece}\` for \`${environment}\`. Check \`${piece}/config/${environment}.yaml\` against the rules for that piece in the app's root \`CLAUDE.md\`; every setting value is a quoted string. The local checks do not render the chart, so they cannot show this. Fix it in a new merge request.`;

export const INSTALL_FAILED = (piece: string): string =>
  `\`${piece}\` did not start in the platform: it never became ready. Run it with the local flow, check with \`list-app-secrets\` that every declared secret has a value, and fix it in a new merge request. The failed release stays installed until then, and the next fix comes through a merge request.`;

export const PATH_FAILED = (
  piece: string,
  path: string,
  status: string,
  attempts: string,
): string =>
  `\`${piece}\` is running but \`${path}\` answered \`${status}\` after \`${attempts}\` tries instead of the expected answer. Reproduce it with the local flow and fix it in a new merge request. The new version stays deployed until then.`;

export const NOT_RUN = (piece: string, link: string): string =>
  `The smoke check of \`${piece}\` could not run. This is not caused by the change. Give the platform team this link: ${link}.`;

export const PLATFORM_FAILED = (link: string): string =>
  `The deploy could not reach the platform's cluster or chart registry. This is not caused by the change; do not change the code. Give the platform team this link: ${link}.`;

export const DEPLOY_NO_DETAIL = (link: string): string =>
  `The deploy failed and left no result the portal can read. Explain the cause to the user from the end of its log in failedJobs, without repeating any value that looks like a secret; if the cause is in the platform, give the platform team this link: ${link}. Do not change the code until they answer.`;

export const DEFAULT_PIPELINE_ENDED = (commit: string, link: string): string =>
  `The default-branch pipeline for commit \`${commit}\` was canceled or skipped before its deploy finished. Give the platform team this link: ${link}.`;

export const REQUEST_PIPELINE_FAILED_NO_JOB = (link: string): string =>
  `The merge request's pipeline failed without a failed job. Give the platform team this link: ${link}.`;

export const DEFAULT_PIPELINE_FAILED_NO_JOB = (link: string): string =>
  `The default-branch pipeline failed without a failed job. Give the platform team this link: ${link}.`;

export const BLOCKED_MR = (iid: number, detail: string): string =>
  `Merge request !${iid} is blocked: ${detail}`;

export const LIVE_VERSION = (commit: string): string =>
  `The live version is commit \`${commit}\`.`;

export const PUBLICATION_RUNNING = (commit: string): string =>
  `A publication is running for commit \`${commit}\`. Call \`wait-for-app-publication\` with that commit.`;

export const PUBLISHED_AT = (commit: string): string =>
  `Published at commit \`${commit}\`; every piece passed the smoke check.`;

export const LINT_OR_BUILD = (job: string): string =>
  `The check \`${job}\` failed on the change. Run the local checks that the app's root \`CLAUDE.md\` names, fix what fails, and push again with \`-o merge_request.auto_merge\`.`;

/** One refused config: a piece and an environment, both already checked against the app. */
const refusedClause = ({
  piece,
  environment,
}: {
  piece: string;
  environment: string;
}): string =>
  `\`${piece}\` for \`${environment}\` (file \`${piece}/config/${environment}.yaml\`)`;

/** The refusals of the render check, named one by one: "a", "a and b", "a, b and c". */
function joinClauses(clauses: readonly string[]): string {
  const last = clauses.slice(-1).join('');
  const others = clauses.slice(0, -1);
  return others.length === 0 ? last : `${others.join(', ')} and ${last}`;
}

/**
 * The render check's refusals of a merge request. A line of the job's log can
 * trigger this sentence, so it names only the app's own pieces and environments.
 */
export const RENDER_REFUSED = (
  refusals: readonly { piece: string; environment: string }[],
  link: string,
): string =>
  `The platform chart refused the config of ${joinClauses(
    refusals.map(refusedClause),
  )}. The end of the check's log in its failedJobs entry should give the key and the reason; explain them to the user without repeating any value that looks like a secret. If the log shows no reason for a named file, or the cause is in the platform, give the platform team this link: ${link}. Do not change platform-owned files. The local checks do not cover this: they lint, build and test the code, and they never render the chart. Fix each named file, then push again with \`-o merge_request.auto_merge\`.`;

export const WAITING_FOR_PUSH = (commit: string): string =>
  `GitLab does not show commit \`${commit}\` in a merge request yet. Call this tool again with the same input. If two more calls still do not see it, check that \`git push\` succeeded and that its output named a merge request.`;

export const MERGE_STUCK = (mergeStatus: string): string =>
  `The checks passed and the merge request is merging. Call this tool again with the same input. If three calls in a row return \`merging\`, the merge is stuck on \`${mergeStatus}\`: give the platform team the merge request's link.`;

export const DEPLOY_NOT_RUN = (link: string): string =>
  `The deploy job of this change did not run, although its pipeline succeeded, and no newer default-branch pipeline publishes it. This is not caused by the change. Give the platform team this link: ${link}. Do not change the code.`;
