export interface Config {
  pipelineAgent?: {
    /**
     * `fake` runs scripted investigations without calling Anthropic or GitLab.
     * `real` calls the Managed Agents API and the GitLab API.
     * @default "fake"
     */
    mode?: 'fake' | 'real';
    /**
     * Bindings of a GitLab project to the one entity allowed to use it. The backend
     * writes only to the project in the entity's gitlab.com/project-slug annotation,
     * so an entity answers only when its slug is bound to its own entityRef here.
     * Real mode with no list denies every project. Fake mode defaults to
     * veecode-demos/pedidos-api bound to component:default/pedidos-api.
     */
    allowedProjects?: Array<{
      /**
       * GitLab project slug, exactly `group/project`. No patterns.
       */
      project: string;
      /**
       * Entity reference in the stringifyEntityRef form, for example
       * `component:default/pedidos-api`.
       */
      entityRef: string;
    }>;
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
