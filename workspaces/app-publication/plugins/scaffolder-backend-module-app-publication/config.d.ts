export interface Config {
  /**
   * Reads where an app's change stands: its merge request, the default
   * branch's pipeline, the deploy job and the smoke check. Every key is optional.
   */
  appPublication?: {
    /**
     * GitLab group path under which every app's project must sit, for example
     * example-org/apps. Required. An app whose catalog entry names a project
     * outside this group is refused before the portal reads GitLab.
     * @visibility backend
     */
    projectPathPrefix: string;
    /**
     * Environments a deploy file may name. A file for any other environment is
     * treated as unreadable. Default: dev.
     * @visibility backend
     */
    environments?: string[];
    /**
     * Name of the job that deploys every piece and runs the smoke check.
     * Default: deploy.
     * @visibility backend
     */
    deployJobName?: string;
    /**
     * Artifact path of the deploy job's result file. Default: smoke-result.json.
     * @visibility backend
     */
    deployResultArtifact?: string;
    /**
     * Name of the merge-request job that checks platform-owned files.
     * Default: contract.
     * @visibility backend
     */
    contractJobName?: string;
    /**
     * Artifact path of that job's result file. Default: contract-result.json.
     * @visibility backend
     */
    contractResultArtifact?: string;
    /**
     * Name of the job that fails on Git conflict markers. Default: conflict-markers.
     * @visibility backend
     */
    conflictMarkersJobName?: string;
    /**
     * Longest wait of one wait-for-app-publication call, in seconds.
     * Default 20; at most 270. Raise it to about 240 only when the MCP server
     * sends progress notifications.
     * @visibility backend
     */
    maxWaitSeconds?: number;
    /**
     * Seconds between two GitLab reads while waiting. Default 5; from 2 to 60,
     * and below maxWaitSeconds.
     * @visibility backend
     */
    pollIntervalSeconds?: number;
    /**
     * Largest result file read, in bytes. Default 65536.
     * @visibility backend
     */
    maxArtifactBytes?: number;
    /**
     * Number of final log lines returned for a failed job that has no fixed
     * explanation. Default 40; from 1 to 200.
     * @visibility backend
     */
    failedJobLogLines?: number;
    /**
     * Value of `type` on the System's metadata.links that marks an
     * environment's address. Default: app-address.
     * @visibility backend
     */
    addressLinkType?: string;
    /**
     * Component annotation that holds a piece's dashboard URL.
     * Default: grafana/overview-dashboard.
     * @visibility backend
     */
    dashboardAnnotation?: string;
  };
}
