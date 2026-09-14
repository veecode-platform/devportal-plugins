export interface Config {
  gitlabPipelines?: {
    lifecycle?: {
      /**
       * Enables the lifecycle reconciler. Fully off by default: no operation
       * is recorded and no scheduled reconciliation runs.
       */
      enabled?: boolean;
      /**
       * Manual job name that marks a teardown when played through this
       * plugin.
       * @default "destroy"
       */
      teardownJobName?: string;
      /**
       * Catalog descriptor file deleted from the default branch once a
       * teardown operation is confirmed.
       * @default "catalog-info.yaml"
       */
      catalogFile?: string;
      /**
       * Manual job name checked for a later successful run when deciding
       * whether a teardown was superseded.
       * @default "deploy"
       */
      deployJobName?: string;
      /**
       * How often the reconciler re-checks pending teardown operations, in
       * seconds.
       * @default 60
       */
      reconcileIntervalSeconds?: number;
    };
  };
}
