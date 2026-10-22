export interface Config {
  aws?: {
    /**
     * Lambda functions that scaffolder templates may invoke through the
     * `aws:lambda:invoke` action. A template names an entry by its alias and
     * never an ARN; an alias that is not listed here is refused.
     * @visibility backend
     */
    lambdaTargets?: Array<{
      /**
       * The name a template uses to select this target. Must be unique.
       */
      alias: string;
      /**
       * IAM role the portal assumes before each invocation.
       */
      roleArn: string;
      /**
       * ARN of the Lambda function invoked synchronously.
       */
      functionArn: string;
      /**
       * Region of the function and of the assumed-role session.
       */
      region: string;
      /**
       * External ID sent when assuming roleArn, for a trust policy that
       * requires one.
       */
      externalId?: string;
    }>;
  };
}
