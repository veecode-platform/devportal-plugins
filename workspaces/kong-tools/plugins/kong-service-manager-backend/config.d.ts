export interface Config {
  kong?: {
    promotion?: {
      /**
       * Enables Kong plugin promote-to-code. Fully off by default: no
       * promotion record is persisted and no reconciler runs.
       */
      enabled?: boolean;
      /**
       * How long an in-flight promotion waits for the merged deploy to
       * reconcile (the code-owned plugin to converge) before the finalizer
       * restores the experimental plugin and marks the promotion failed, in
       * minutes.
       * @default 10
       */
      applyTimeoutMinutes?: number;
      /**
       * How often the finalizer re-checks non-terminal promotion records,
       * in seconds.
       * @default 60
       */
      reconcileIntervalSeconds?: number;
    };
  };
}
