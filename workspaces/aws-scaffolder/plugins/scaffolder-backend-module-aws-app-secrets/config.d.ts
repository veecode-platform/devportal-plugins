export interface Config {
  /**
   * Writes an app's secrets to AWS Secrets Manager, and lists them.
   */
  appSecrets?: {
    /**
     * Region of the secrets and of the writer role's session.
     * @visibility backend
     */
    region: string;
    /**
     * IAM role the portal assumes for every call. The only identity that writes.
     * @visibility backend
     */
    writerRoleArn: string;
    /**
     * Secret name pattern. Must contain {app}, {environment} and {name}; may
     * contain {cluster}.
     * @visibility backend
     */
    pathPattern: string;
    /**
     * Value of the {cluster} placeholder. Required when pathPattern uses it.
     * @visibility backend
     */
    cluster?: string;
    /**
     * Environments an app may declare and register secrets for.
     * @visibility backend
     */
    environments: string[];
    /**
     * File in each component's folder that lists its secrets, relative to that
     * folder and containing {environment}. Defaults to config/{environment}.yaml.
     * @visibility backend
     */
    declarationFile?: string;
    /**
     * Names no app may register.
     * @visibility backend
     */
    reservedNames: string[];
    /**
     * Name prefixes no app may register.
     * @visibility backend
     */
    reservedPrefixes: string[];
  };
}
