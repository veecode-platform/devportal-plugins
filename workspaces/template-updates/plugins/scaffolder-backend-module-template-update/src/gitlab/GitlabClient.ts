import { ConflictError, InputError, NotFoundError } from '@backstage/errors';
import { ScmIntegrations } from '@backstage/integration';
import { parseGitlabLocation } from './repoLocation';

type Fetch = typeof globalThis.fetch;

export interface GitlabProject {
  id: number;
  projectSlug: string;
  host: string;
  repoUrl: string;
  defaultBranch: string;
}

export type GitlabCommitAction =
  | { action: 'delete'; file_path: string }
  | {
      action: 'create' | 'update';
      file_path: string;
      content: string;
      encoding?: 'base64';
    };

export interface GitlabMergeRequest {
  iid: number;
  webUrl: string;
}

export interface MergeRequestDetails {
  title: string;
  description: string;
}

interface GitlabApiError extends Error {
  status: number;
}

export class GitlabClient {
  constructor(
    private readonly integrations: ScmIntegrations,
    private readonly fetchImpl: Fetch = globalThis.fetch,
  ) {}

  async getProject(repoUrl: string): Promise<GitlabProject> {
    const location = parseGitlabLocation(repoUrl);
    const target = this.target(location.host, location.projectSlug);
    const project = await this.call<{ id: number; default_branch?: string }>(
      target,
      target.projectPath,
    );
    if (!project.default_branch) {
      throw new InputError(
        `GitLab project ${location.projectSlug} has no default branch`,
      );
    }
    return {
      id: project.id,
      projectSlug: location.projectSlug,
      host: location.host,
      repoUrl: location.repoUrl,
      defaultBranch: project.default_branch,
    };
  }

  async resolveCommitSha(repoUrl: string, ref: string): Promise<string> {
    const location = parseGitlabLocation(repoUrl);
    const target = this.target(location.host, location.projectSlug);
    const commits = await this.call<Array<{ id: string }>>(
      target,
      `${target.projectPath}/repository/commits?ref_name=${encodeURIComponent(
        ref,
      )}&per_page=1`,
    );
    if (!commits[0]?.id) {
      throw new NotFoundError(
        `GitLab ref ${ref} was not found in ${location.projectSlug}`,
      );
    }
    return commits[0].id;
  }

  async readRepositoryFiles(
    project: GitlabProject,
    ref: string,
  ): Promise<Record<string, Buffer>> {
    const target = this.target(project.host, project.projectSlug);
    const entries: Array<{ path: string; type: string }> = [];
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      const response = await this.callWithResponse<
        Array<{ path: string; type: string }>
      >(
        target,
        `${
          target.projectPath
        }/repository/tree?recursive=true&ref=${encodeURIComponent(
          ref,
        )}&per_page=100&page=${page}`,
      );
      entries.push(...response.body);
      const nextPage = response.headers.get('x-next-page');
      if (!nextPage) {
        hasMorePages = false;
        continue;
      }
      page = Number(nextPage);
      if (!Number.isInteger(page) || page < 1) {
        throw new Error('GitLab returned an invalid repository tree page');
      }
    }

    const files: Record<string, Buffer> = {};
    const paths = entries
      .filter(entry => entry.type === 'blob')
      .map(entry => entry.path);
    for (let index = 0; index < paths.length; index += 10) {
      const batch = paths.slice(index, index + 10);
      const contents = await Promise.all(
        batch.map(
          async filePath =>
            [filePath, await this.readRawFile(target, filePath, ref)] as const,
        ),
      );
      for (const [filePath, content] of contents) files[filePath] = content;
    }
    return files;
  }

  async readRepositoryFile(
    repoUrl: string,
    filePath: string,
    ref: string,
  ): Promise<Buffer> {
    const location = parseGitlabLocation(repoUrl);
    const target = this.target(location.host, location.projectSlug);
    return this.readRawFile(target, filePath, ref);
  }

  async createCommit(
    project: GitlabProject,
    branch: string,
    startSha: string,
    message: string,
    actions: GitlabCommitAction[],
  ): Promise<{ sha: string }> {
    const target = this.target(project.host, project.projectSlug);
    const commit = await this.call<{ id: string }>(
      target,
      `${target.projectPath}/repository/commits`,
      {
        method: 'POST',
        body: {
          branch,
          start_sha: startSha,
          force: true,
          commit_message: message,
          actions,
        },
      },
    );
    return { sha: commit.id };
  }

  async findOpenMergeRequest(
    project: GitlabProject,
    branch: string,
  ): Promise<GitlabMergeRequest | undefined> {
    const target = this.target(project.host, project.projectSlug);
    const query = new URLSearchParams({
      source_branch: branch,
      state: 'opened',
    });
    const requests = await this.call<Array<{ iid: number; web_url: string }>>(
      target,
      `${target.projectPath}/merge_requests?${query.toString()}`,
    );
    const request = requests[0];
    return request ? { iid: request.iid, webUrl: request.web_url } : undefined;
  }

  async updateMergeRequest(
    project: GitlabProject,
    iid: number,
    details: MergeRequestDetails,
  ): Promise<void> {
    const target = this.target(project.host, project.projectSlug);
    await this.call(target, `${target.projectPath}/merge_requests/${iid}`, {
      method: 'PUT',
      body: details,
    });
  }

  async createMergeRequest(
    project: GitlabProject,
    branch: string,
    details: MergeRequestDetails,
  ): Promise<GitlabMergeRequest> {
    const target = this.target(project.host, project.projectSlug);
    const request = await this.call<{ iid: number; web_url: string }>(
      target,
      `${target.projectPath}/merge_requests`,
      {
        method: 'POST',
        body: {
          source_branch: branch,
          target_branch: project.defaultBranch,
          title: details.title,
          description: details.description,
        },
      },
    );
    return { iid: request.iid, webUrl: request.web_url };
  }

  private async readRawFile(
    target: GitlabTarget,
    filePath: string,
    ref: string,
  ): Promise<Buffer> {
    const url = `${target.projectPath}/repository/files/${encodeURIComponent(
      filePath,
    )}/raw?ref=${encodeURIComponent(ref)}`;
    const response = await this.fetchImpl(url, {
      headers: { 'PRIVATE-TOKEN': target.token },
    });
    if (!response.ok) throw await this.apiError(response);
    return Buffer.from(await response.arrayBuffer());
  }

  private target(host: string, projectSlug: string): GitlabTarget {
    const integration = this.integrations.gitlab.byHost(host);
    if (!integration)
      throw new NotFoundError(
        `No GitLab integration configured for host ${host}`,
      );
    const { token, apiBaseUrl } = integration.config;
    if (!token)
      throw new ConflictError(`GitLab integration for ${host} has no token`);
    const apiBase = (apiBaseUrl ?? `https://${host}/api/v4`).replace(/\/$/, '');
    return {
      token,
      projectPath: `${apiBase}/projects/${encodeURIComponent(projectSlug)}`,
    };
  }

  private async call<T>(
    target: GitlabTarget,
    url: string,
    options: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    return (await this.callWithResponse<T>(target, url, options)).body;
  }

  private async callWithResponse<T>(
    target: GitlabTarget,
    url: string,
    options: { method?: string; body?: unknown } = {},
  ): Promise<{ body: T; headers: Headers }> {
    const response = await this.fetchImpl(url, {
      method: options.method ?? 'GET',
      headers: {
        'PRIVATE-TOKEN': target.token,
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (!response.ok) throw await this.apiError(response);
    if (response.status === 204)
      return { body: undefined as T, headers: response.headers };
    return { body: (await response.json()) as T, headers: response.headers };
  }

  private async apiError(response: Response): Promise<GitlabApiError> {
    const error = new Error(
      `GitLab request failed with status ${response.status}`,
    ) as GitlabApiError;
    error.status = response.status;
    return error;
  }
}

interface GitlabTarget {
  token: string;
  projectPath: string;
}
