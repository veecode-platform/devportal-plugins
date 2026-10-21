export interface Config {
  pipelineAgent?: {
    /**
     * `fake` runs scripted investigations without calling Anthropic or GitLab.
     * `real` calls the Managed Agents API and the GitLab API.
     * @default "fake"
     */
    mode?: 'fake' | 'real';
    anthropic?: {
      /**
       * Anthropic API key. Only the backend reads it; the browser never sees it.
       * @visibility secret
       */
      apiKey?: string;
    };
    /**
     * Managed Agents agent id used to start each investigation.
     */
    agentId?: string;
    /**
     * Managed Agents environment id the investigation session runs in.
     */
    environmentId?: string;
    gitlab?: {
      /**
       * Base URL of the GitLab instance that hosts the entity projects.
       * @default "https://gitlab.com"
       */
      baseUrl?: string;
      /**
       * GitLab token that opens merge requests. Only the backend reads it.
       * @visibility secret
       */
      token?: string;
    };
  };
}
