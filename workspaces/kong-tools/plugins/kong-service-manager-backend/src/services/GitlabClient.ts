import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { BackstageCredentials, RootConfigService } from '@backstage/backend-plugin-api';
import { ConflictError, InputError, NotFoundError } from '@backstage/errors';
import { ScmIntegrations } from '@backstage/integration';
import { CatalogService } from '@backstage/plugin-catalog-node';
import { FileEdit } from './adapters/types';

/** Well-known Backstage annotation carrying the owning repo's `group/project` slug. */
const GITLAB_PROJECT_SLUG_ANNOTATION = 'gitlab.com/project-slug';
const ANNOTATION_SOURCE_LOCATION = 'backstage.io/source-location';
const ANNOTATION_MANAGED_BY_LOCATION = 'backstage.io/managed-by-location';

type Fetch = typeof globalThis.fetch;

type GitlabRequestError = Error & { status: number; upstreamBody: string };

export interface ResolvedRepo {
  host: string;
  projectSlug: string;
  projectId: number;
  defaultBranch: string;
}

export interface CommitFile {
  path: string;
  content: string;
  /** Whether the file already existed in the chart before the promotion edits (decides the GitLab commit action). */
  existed: boolean;
}

export interface CreatedMergeRequest {
  projectId: number;
  iid: number;
  webUrl: string;
  /** Present on lookups (`findOpenMergeRequest`); lets the caller tell whose promotion an open MR belongs to (ADR-022). */
  description?: string;
}

export interface MaterializedChart {
  /** Repo-root-equivalent directory; the chart itself lives at `<dir>/chart` (renderCheck's convention). */
  dir: string;
  cleanup(): Promise<void>;
}

/**
 * GitLab access for Kong plugin promotion (design 02, promotion mechanics
 * steps 3, 5, 6). Resolves the service's owning repo from its catalog
 * entity, materializes just the `chart/` subtree via the repository tree +
 * raw file API (no `git clone`, no token in a URL — same authenticated-fetch
 * idiom as gitlab-pipelines-backend's `GitlabApi`) so the existing
 * `renderCheck` (P2) can run `helm template` against it, and
 * opens/reuses/closes the promotion MR.
 *
 * Every write here is safe to repeat: `ensureBranch` treats "branch already
 * exists" as success, `findOpenMergeRequest` is checked before
 * `openMergeRequest`, and `closeMergeRequest` accepts an already-closed MR —
 * a promote retried after a crash must never open a second MR.
 */
export class GitlabClient {
  static fromConfig(
    config: RootConfigService,
    catalog: CatalogService,
    fetchImpl: Fetch = globalThis.fetch,
  ): GitlabClient {
    return new GitlabClient(ScmIntegrations.fromConfig(config), catalog, fetchImpl);
  }

  constructor(
    private readonly integrations: ScmIntegrations,
    private readonly catalog: CatalogService,
    private readonly fetchImpl: Fetch,
  ) {}

  /** Resolves the owning repo (host, slug, numeric id, default branch) from the entity's GitLab annotations. */
  async resolveRepo(entityRef: string, credentials: BackstageCredentials): Promise<ResolvedRepo> {
    const entity = await this.catalog.getEntityByRef(entityRef, { credentials });
    if (!entity) {
      throw new NotFoundError(`Entity ${entityRef} not found`);
    }

    const annotations = entity.metadata.annotations ?? {};
    const projectSlug = annotations[GITLAB_PROJECT_SLUG_ANNOTATION];
    if (!projectSlug) {
      throw new InputError(
        `Entity ${entityRef} has no ${GITLAB_PROJECT_SLUG_ANNOTATION} annotation — no owning repo to promote into`,
      );
    }

    const location =
      annotations[ANNOTATION_SOURCE_LOCATION] ?? annotations[ANNOTATION_MANAGED_BY_LOCATION];
    let host = 'gitlab.com';
    if (location?.startsWith('url:')) {
      try {
        host = new URL(location.slice(4)).host;
      } catch {
        // keep the gitlab.com default
      }
    }

    const { token, base } = this.target(host, projectSlug);
    const project = await this.call<{ id: number; default_branch: string }>(token, base);
    return { host, projectSlug, projectId: project.id, defaultBranch: project.default_branch };
  }

  /**
   * Downloads the `chart/` subtree of `repo` at `ref` into a throwaway
   * directory shaped `<dir>/chart/...`, matching what `renderCheck` expects
   * as a repo checkout. Caller must call `cleanup()`.
   */
  async materializeChart(repo: ResolvedRepo, ref: string): Promise<MaterializedChart> {
    const { token, base } = this.target(repo.host, repo.projectSlug);
    const entries = await this.call<Array<{ path: string; type: string }>>(
      token,
      `${base}/repository/tree?path=chart&recursive=true&ref=${encodeURIComponent(ref)}&per_page=100`,
    );
    if (entries.length === 0) {
      throw new InputError(
        `Repo ${repo.host}/${repo.projectSlug} has no 'chart' directory at ${ref} — not a golden-path chart repo`,
      );
    }

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kong-promotion-'));
    for (const entry of entries.filter(e => e.type === 'blob')) {
      const raw = await this.callRaw(
        token,
        `${base}/repository/files/${encodeURIComponent(entry.path)}/raw?ref=${encodeURIComponent(ref)}`,
      );
      const target = path.join(dir, entry.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, raw);
    }

    return { dir, cleanup: () => fs.rm(dir, { recursive: true, force: true }) };
  }

  /**
   * Which of `paths` already exist on `ref` in GitLab. Must be checked
   * against the promotion branch, not the materialized default-branch copy
   * `renderCheck` runs against — a crash-retry, or a promote issued right
   * after a discard (which closes the MR but leaves the branch), can find
   * the branch already carrying a prior commit; getting this wrong sends a
   * GitLab `create` action for a file the branch already has, which GitLab
   * rejects with a 400.
   */
  async pathsExistingOnRef(repo: ResolvedRepo, ref: string, paths: string[]): Promise<Set<string>> {
    const { token, base } = this.target(repo.host, repo.projectSlug);
    const existing = new Set<string>();
    for (const p of paths) {
      try {
        await this.callRaw(
          token,
          `${base}/repository/files/${encodeURIComponent(p)}/raw?ref=${encodeURIComponent(ref)}`,
        );
        existing.add(p);
      } catch (err) {
        const e = err as GitlabRequestError;
        if (e.status === 404) continue; // absent on this ref — will be a `create` action
        throw err;
      }
    }
    return existing;
  }

  /**
   * Resolves a ref (branch name or SHA) to its commit SHA. Lets a caller pin
   * one commit and reuse it across reads and writes that would otherwise each
   * re-resolve a moving branch name independently — the promote flow renders the
   * chart at the default branch and then cuts the promotion branch from it, and
   * a merge landing in between must not base the branch on a tree the render
   * check never verified (F3 TOCTOU).
   */
  async resolveRefSha(repo: ResolvedRepo, ref: string): Promise<string> {
    const { token, base } = this.target(repo.host, repo.projectSlug);
    const commit = await this.call<{ id: string }>(
      token,
      `${base}/repository/commits/${encodeURIComponent(ref)}`,
    );
    return commit.id;
  }

  async ensureBranch(repo: ResolvedRepo, branch: string, ref: string = repo.defaultBranch): Promise<void> {
    const { token, base } = this.target(repo.host, repo.projectSlug);
    try {
      await this.call(token, `${base}/repository/branches`, {
        method: 'POST',
        body: { branch, ref },
      });
    } catch (err) {
      const e = err as GitlabRequestError;
      if (e.status === 400 && /already exists/i.test(e.upstreamBody ?? '')) {
        return; // reuse: the caller has verified an MR is still open for it (ADR-022)
      }
      throw err;
    }
  }

  /** True when `path` exists on `ref` (raw-file HEAD-equivalent; 404 = absent). */
  async fileExistsOnRef(repo: { host: string; projectSlug: string }, ref: string, path: string): Promise<boolean> {
    const { token, base } = this.target(repo.host, repo.projectSlug);
    try {
      await this.callRaw(token, `${base}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(ref)}`);
      return true;
    } catch (err) {
      const e = err as GitlabRequestError;
      if (e.status === 404) return false;
      throw err;
    }
  }

  /** Idempotent: deleting a branch that is already gone is a no-op success. */
  async deleteBranch(repo: { host: string; projectSlug: string }, branch: string): Promise<void> {
    const { token, base } = this.target(repo.host, repo.projectSlug);
    try {
      await this.call(token, `${base}/repository/branches/${encodeURIComponent(branch)}`, {
        method: 'DELETE',
      });
    } catch (err) {
      const e = err as GitlabRequestError;
      if (e.status === 404) return;
      throw err;
    }
  }

  /**
   * Commits `edits` (read back from `dir` post-`renderCheck`, so the commit
   * content is exactly what was equivalence-checked) onto `branch`.
   */
  async commitEdits(
    repo: ResolvedRepo,
    branch: string,
    dir: string,
    edits: FileEdit[],
    existing: Set<string>,
    message: string,
  ): Promise<{ sha: string }> {
    const actions = (
      await Promise.all(
        edits.map(async (edit): Promise<{ action: string; file_path: string; content?: string } | undefined> => {
          if (edit.op === 'delete') {
            // Delete-in-code (issue #3): GitLab 400s on deleting a path that is
            // absent on the ref, so only emit the action when the branch still
            // has the file — an already-gone file is an idempotent no-op.
            if (!existing.has(edit.path)) return undefined;
            return { action: 'delete', file_path: edit.path };
          }
          return {
            action: existing.has(edit.path) ? 'update' : 'create',
            file_path: edit.path,
            content: await fs.readFile(path.join(dir, edit.path), 'utf8'),
          };
        }),
      )
    ).filter((a): a is { action: string; file_path: string; content?: string } => a !== undefined);

    if (actions.length === 0) {
      // Nothing left to change on the branch (e.g. a removal whose target was
      // already gone). Return the branch head so the caller can still open or
      // reuse an MR without a failing empty commit.
      const head = await this.resolveRefSha(repo, branch);
      return { sha: head };
    }

    const { token, base } = this.target(repo.host, repo.projectSlug);
    const commit = await this.call<{ id: string }>(token, `${base}/repository/commits`, {
      method: 'POST',
      body: { branch, commit_message: message, actions },
    });
    return { sha: commit.id };
  }

  /** Reuses an already-open MR from a prior (crashed) attempt instead of opening a second one. Also the finalizer's (P4) draft-orphan probe: only `host`/`projectSlug` are used. */
  async findOpenMergeRequest(
    repo: { host: string; projectSlug: string },
    branch: string,
  ): Promise<CreatedMergeRequest | undefined> {
    const { token, base } = this.target(repo.host, repo.projectSlug);
    const mrs = await this.call<Array<{ project_id: number; iid: number; web_url: string; description?: string }>>(
      token,
      `${base}/merge_requests?source_branch=${encodeURIComponent(branch)}&state=opened`,
    );
    const mr = mrs[0];
    return mr
      ? { projectId: mr.project_id, iid: mr.iid, webUrl: mr.web_url, description: mr.description ?? '' }
      : undefined;
  }

  async openMergeRequest(
    repo: ResolvedRepo,
    branch: string,
    title: string,
    description: string,
  ): Promise<CreatedMergeRequest> {
    const { token, base } = this.target(repo.host, repo.projectSlug);
    const mr = await this.call<{ project_id: number; iid: number; web_url: string }>(
      token,
      `${base}/merge_requests`,
      {
        method: 'POST',
        body: {
          source_branch: branch,
          target_branch: repo.defaultBranch,
          title,
          description,
          remove_source_branch: true,
        },
      },
    );
    return { projectId: mr.project_id, iid: mr.iid, webUrl: mr.web_url };
  }

  /** Idempotent: closing an MR that is already closed/merged is a no-op success. */
  async closeMergeRequest(repo: { host: string; projectSlug: string }, iid: number): Promise<void> {
    const { token, base } = this.target(repo.host, repo.projectSlug);
    try {
      await this.call(token, `${base}/merge_requests/${iid}`, {
        method: 'PUT',
        body: { state_event: 'close' },
      });
    } catch (err) {
      const e = err as GitlabRequestError;
      if (e.status === 405 || e.status === 404) {
        return; // already closed/merged, or gone — discard is still a success
      }
      throw err;
    }
  }

  /** MR state + merge timestamp for the finalizer (P4) loop — `merged_at` anchors the "deploy of the merge commit or newer" check. */
  async getMergeRequest(
    repo: { host: string; projectSlug: string },
    iid: number,
  ): Promise<{ state: string; mergedAt: string | null }> {
    const { token, base } = this.target(repo.host, repo.projectSlug);
    const mr = await this.call<{ state: string; merged_at: string | null }>(
      token,
      `${base}/merge_requests/${iid}`,
    );
    return { state: mr.state, mergedAt: mr.merged_at };
  }

  /**
   * Project status for the finalizer's (P4) teardown interaction and its
   * default branch for the deploy-pipeline check. Throws (with `.status`
   * set) on a non-2xx response — a 404 is the caller's signal that the
   * project itself is gone, not merely archived.
   */
  async getProject(repo: { host: string; projectSlug: string }): Promise<{ archived: boolean; defaultBranch: string }> {
    const { token, base } = this.target(repo.host, repo.projectSlug);
    const project = await this.call<{ archived: boolean; default_branch: string }>(token, base);
    return { archived: project.archived, defaultBranch: project.default_branch };
  }

  /** Shas of every commit on `ref` at or after `since` (a GitLab `merged_at`-style ISO timestamp). */
  async listCommitShasSince(
    repo: { host: string; projectSlug: string },
    ref: string,
    since: string,
  ): Promise<Set<string>> {
    const { token, base } = this.target(repo.host, repo.projectSlug);
    const commits = await this.call<Array<{ id: string }>>(
      token,
      `${base}/repository/commits?ref_name=${encodeURIComponent(ref)}&since=${encodeURIComponent(since)}&per_page=100`,
    );
    return new Set(commits.map(c => c.id));
  }

  /** Successful pipelines run against `ref`, most recent first. */
  async listSuccessfulPipelines(
    repo: { host: string; projectSlug: string },
    ref: string,
  ): Promise<Array<{ id: number; sha: string }>> {
    const { token, base } = this.target(repo.host, repo.projectSlug);
    return this.call<Array<{ id: number; sha: string }>>(
      token,
      `${base}/pipelines?ref=${encodeURIComponent(ref)}&status=success&order_by=id&sort=desc&per_page=100`,
    );
  }

  /**
   * Successful GitLab deployments of `ref` created at or after `since`
   * (a `merged_at`-style ISO timestamp). A deployment record exists only when
   * the deploy job declares an `environment:`; `created_at` is when that job
   * started, so a record at/after the merge timestamp deployed the merge
   * commit or a descendant of it.
   */
  async listSuccessfulDeploymentsSince(
    repo: { host: string; projectSlug: string },
    ref: string,
    since: string,
  ): Promise<Array<{ id: number; sha: string; ref: string; createdAt: string }>> {
    const { token, base } = this.target(repo.host, repo.projectSlug);
    const deployments = await this.call<
      Array<{ id: number; sha: string; ref: string; status: string; created_at: string }>
    >(
      token,
      // GitLab rejects `updated_after` unless the sort is `updated_at` (400:
      // "`updated_at` filter requires `updated_at` sort") — seen live on 18.1.
      `${base}/deployments?status=success&updated_after=${encodeURIComponent(since)}&order_by=updated_at&sort=desc&per_page=100`,
    );
    const sinceMs = Date.parse(since);
    return deployments
      .filter(d => d.ref === ref && d.status === 'success' && Date.parse(d.created_at) >= sinceMs)
      .map(d => ({ id: d.id, sha: d.sha, ref: d.ref, createdAt: d.created_at }));
  }

  /**
   * Design 02's "successful deploy of the merge commit (or newer) on the
   * default branch". Primary signal (ADR-019): a successful GitLab
   * *deployment* of `ref` created at or after `since` — pipeline status is
   * not a deploy signal, because a pipeline carrying a blocking manual job
   * (the golden path's `destroy`, `allow_failure: false`) reports `manual`
   * forever, never `success`. Fallback for repos whose deploy job declares no
   * `environment:` (so no deployment records exist): a successful pipeline
   * for a commit at or after `since`. Never assumes the merge itself deployed
   * anything — a service with auto-deploy off just never returns true here,
   * and the finalizer stays parked.
   */
  async hasSuccessfulDeployAtOrAfter(
    repo: { host: string; projectSlug: string },
    ref: string,
    since: string,
  ): Promise<boolean> {
    const deployments = await this.listSuccessfulDeploymentsSince(repo, ref, since);
    if (deployments.length > 0) return true;

    const [shas, pipelines] = await Promise.all([
      this.listCommitShasSince(repo, ref, since),
      this.listSuccessfulPipelines(repo, ref),
    ]);
    return pipelines.some(p => shas.has(p.sha));
  }

  private target(host: string, projectSlug: string): { token: string; base: string } {
    const integration = this.integrations.gitlab.byHost(host);
    if (!integration) {
      throw new NotFoundError(`No GitLab integration configured for host ${host}`);
    }
    const { token, apiBaseUrl } = integration.config;
    if (!token) {
      throw new ConflictError(`GitLab integration for ${host} has no token — promotion cannot write to it`);
    }
    return { token, base: `${apiBaseUrl}/projects/${encodeURIComponent(projectSlug)}` };
  }

  private async call<T>(
    token: string,
    url: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const res = await this.fetchImpl(url, {
      method: init.method ?? 'GET',
      headers: {
        'PRIVATE-TOKEN': token,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`GitLab request failed with status ${res.status}`) as GitlabRequestError;
      err.status = res.status;
      err.upstreamBody = text;
      throw err;
    }
    if (res.status === 204) {
      return undefined as T;
    }
    return (await res.json()) as T;
  }

  private async callRaw(token: string, url: string): Promise<string> {
    const res = await this.fetchImpl(url, { headers: { 'PRIVATE-TOKEN': token } });
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`GitLab request failed with status ${res.status}`) as GitlabRequestError;
      err.status = res.status;
      err.upstreamBody = text;
      throw err;
    }
    return res.text();
  }
}
