export interface Config {
  kong?: {
    promotion?: {
      /**
       * Enables Kong plugin promote-to-code. Fully off by default: no
       * promotion record is persisted and no reconciler runs.
       */
      enabled?: boolean;
      /**
       * How long a deployed promotion waits for the code-owned plugin to
       * converge before the finalizer gives up and marks the promotion
       * `failed`, in minutes. Nothing is restored on timeout: the
       * experimental plugin is removed when the merge request is merged and
       * recreating it would collide with the merged chart's own plugin
       * (one plugin per type per route). Recovery is manual — fix the chart
       * or revert the merge request.
       * @default 10
       */
      applyTimeoutMinutes?: number;
      /**
       * How often the finalizer re-checks non-terminal promotion records,
       * in seconds.
       * @default 60
       */
      reconcileIntervalSeconds?: number;
      /**
       * Path (or bare command, resolved on PATH) to the `helm` CLI binary.
       * Promote-to-code renders the target chart with `helm template` to
       * verify equivalence before writing — this is a **deployment
       * prerequisite**: the portal image does not bundle helm, so whatever
       * deploys this backend must provide the binary and point this setting
       * at it. When it can't be found, preview and promote return 503
       * instead of applying; everything else (including the finalizer,
       * which never renders) keeps working. See the backend package's
       * README, "Prerequisites".
       * @default "helm"
       */
      helmPath?: string;
      /**
       * Timeout for each `helm` invocation (both the startup capability
       * probe and every render during preview/promote), in seconds.
       * @default 60
       */
      helmTimeoutSeconds?: number;
    };
  };
}
