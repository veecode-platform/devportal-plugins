import { RootConfigService } from '@backstage/backend-plugin-api';
import { NotFoundError } from '@backstage/errors';
import { ScmIntegrations } from '@backstage/integration';
import { BranchDto, JobDto, PipelineDto, PipelineVariable } from '@veecode-platform/gitlab-pipelines-common';

type Fetch = typeof globalThis.fetch;

export class GitlabApi {
  static fromConfig(config: RootConfigService, fetchImpl: Fetch = globalThis.fetch) {
    return new GitlabApi(ScmIntegrations.fromConfig(config), fetchImpl);
  }
  constructor(private readonly integrations: ScmIntegrations, private readonly fetchImpl: Fetch) {}

  private target(host: string, projectSlug: string) {
    const integration = this.integrations.gitlab.byHost(host);
    if (!integration) throw new NotFoundError(`No GitLab integration configured for host ${host}`);
    const { token, apiBaseUrl } = integration.config;
    if (!token) throw new NotFoundError(`GitLab integration for ${host} has no token`);
    return { token, base: `${apiBaseUrl}/projects/${encodeURIComponent(projectSlug)}` };
  }

  private async call<T>(host: string, slug: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const { token, base } = this.target(host, slug);
    const res = await this.fetchImpl(`${base}${path}`, {
      method: init.method ?? 'GET',
      headers: { 'PRIVATE-TOKEN': token, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`GitLab ${init.method ?? 'GET'} ${path} failed: ${res.status} ${text}`);
      (err as any).status = res.status;
      throw err;
    }
    return (await res.json()) as T;
  }

  listBranches(host: string, slug: string) {
    return this.call<any[]>(host, slug, '/repository/branches?per_page=100').then(b => b.map(x => ({ name: x.name, default: !!x.default, protected: !!x.protected }) as BranchDto));
  }
  listPipelines(host: string, slug: string, ref: string) {
    return this.call<any[]>(host, slug, `/pipelines?ref=${encodeURIComponent(ref)}&per_page=20`).then(p => p.map(toPipeline));
  }
  getPipeline(host: string, slug: string, id: number) { return this.call<any>(host, slug, `/pipelines/${id}`).then(toPipeline); }
  listJobs(host: string, slug: string, pipelineId: number) { return this.call<any[]>(host, slug, `/pipelines/${pipelineId}/jobs?per_page=100`).then(j => j.map(toJob)); }
  getJob(host: string, slug: string, jobId: number) { return this.call<any>(host, slug, `/jobs/${jobId}`).then(toJob); }
  createPipeline(host: string, slug: string, ref: string, variables: PipelineVariable[]) {
    return this.call<any>(host, slug, '/pipeline', { method: 'POST', body: { ref, variables: variables.map(v => ({ key: v.key, value: v.value, variable_type: 'env_var' })) } }).then(toPipeline);
  }
  retryPipeline(host: string, slug: string, id: number) { return this.call<any>(host, slug, `/pipelines/${id}/retry`, { method: 'POST' }).then(toPipeline); }
  cancelPipeline(host: string, slug: string, id: number) { return this.call<any>(host, slug, `/pipelines/${id}/cancel`, { method: 'POST' }).then(toPipeline); }
  playJob(host: string, slug: string, jobId: number, variables: PipelineVariable[]) {
    return this.call<any>(host, slug, `/jobs/${jobId}/play`, { method: 'POST', body: { job_variables_attributes: variables.map(v => ({ key: v.key, value: v.value })) } }).then(toJob);
  }
  retryJob(host: string, slug: string, jobId: number) { return this.call<any>(host, slug, `/jobs/${jobId}/retry`, { method: 'POST' }).then(toJob); }
  cancelJob(host: string, slug: string, jobId: number) { return this.call<any>(host, slug, `/jobs/${jobId}/cancel`, { method: 'POST' }).then(toJob); }
}

function toPipeline(p: any): PipelineDto {
  return { id: p.id, projectId: p.project_id, ref: p.ref, sha: p.sha, status: p.status, source: p.source, webUrl: p.web_url, createdAt: p.created_at, updatedAt: p.updated_at };
}
function toJob(j: any): JobDto {
  return { id: j.id, name: j.name, stage: j.stage, status: j.status, manual: j.status === 'manual', allowFailure: !!j.allow_failure, webUrl: j.web_url, startedAt: j.started_at ?? null, finishedAt: j.finished_at ?? null };
}
