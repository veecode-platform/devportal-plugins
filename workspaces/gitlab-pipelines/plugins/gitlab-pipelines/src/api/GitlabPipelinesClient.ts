import { parseEntityRef } from '@backstage/catalog-model';
import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { PipelineVariable } from '@veecode-platform/gitlab-pipelines-common';
import { GitlabPipelinesApi } from './GitlabPipelinesApi';

export class GitlabPipelinesApiClient implements GitlabPipelinesApi {
  constructor(private readonly opts: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {}

  private async url(entityRef: string, path: string) {
    const base = await this.opts.discoveryApi.getBaseUrl('gitlab-pipelines');
    const { kind, namespace, name } = parseEntityRef(entityRef);
    return `${base}/entities/${encodeURIComponent(namespace)}/${encodeURIComponent(kind.toLowerCase())}/${encodeURIComponent(name)}${path}`;
  }
  private async call<T>(entityRef: string, path: string, init?: { method: 'POST'; body?: unknown }): Promise<T> {
    const res = await this.opts.fetchApi.fetch(await this.url(entityRef, path), {
      method: init?.method ?? 'GET',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) {
      let message = `${res.status} ${res.statusText}`;
      try { const j = await res.json(); message = j?.error?.message ?? message; } catch { /* keep */ }
      throw new Error(message);
    }
    return (await res.json()) as T;
  }
  listBranches(e: string) { return this.call<any>(e, '/branches'); }
  listPipelines(e: string, ref: string) { return this.call<any>(e, `/pipelines?ref=${encodeURIComponent(ref)}`); }
  getPipeline(e: string, id: number) { return this.call<any>(e, `/pipelines/${id}`); }
  listJobs(e: string, id: number) { return this.call<any>(e, `/pipelines/${id}/jobs`); }
  createPipeline(e: string, ref: string, variables: PipelineVariable[]) { return this.call<any>(e, '/pipelines', { method: 'POST', body: { ref, variables } }); }
  retryPipeline(e: string, id: number) { return this.call<any>(e, `/pipelines/${id}/retry`, { method: 'POST' }); }
  cancelPipeline(e: string, id: number) { return this.call<any>(e, `/pipelines/${id}/cancel`, { method: 'POST' }); }
  playJob(e: string, jobId: number, variables: PipelineVariable[]) { return this.call<any>(e, `/jobs/${jobId}/play`, { method: 'POST', body: { variables } }); }
  retryJob(e: string, jobId: number) { return this.call<any>(e, `/jobs/${jobId}/retry`, { method: 'POST' }); }
  cancelJob(e: string, jobId: number) { return this.call<any>(e, `/jobs/${jobId}/cancel`, { method: 'POST' }); }
}
