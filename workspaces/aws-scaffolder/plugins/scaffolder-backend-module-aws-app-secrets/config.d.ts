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
     * contain {cluster} and {namespace}. Without {namespace}, only Systems in
     * the default namespace can register secrets.
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
    /**
     * Where the aws:cognito:app-login-client:ensure action creates the app
     * clients. Without it the action refuses to run.
     */
    login?: {
      /**
       * The Cognito user pool the app clients are created in, as
       * <region>_<id>. Its region must match the region of this block.
       * @visibility backend
       */
      userPoolId: string;
      /**
       * Region of the user pool. Defaults to appSecrets.region.
       * @visibility backend
       */
      region?: string;
      /**
       * Origin an app is served from, such as https://{app}.example.test.
       * https only, with no path, query, fragment or credentials. Must contain
       * {app}; may contain {environment} and {namespace}.
       * @visibility backend
       */
      appUrlPattern: string;
      /**
       * Name of an app's client in the pool. Must contain {app} and
       * {environment}; may contain {namespace}, which a System outside the
       * default namespace needs. Neighbouring placeholders must be separated
       * by one of . _ + = , @, which no app or environment name contains.
       * Defaults to {app}.{environment}.
       * @visibility backend
       */
      clientNamePattern?: string;
      /**
       * Identity providers the clients sign in through. Defaults to ["Google"].
       * @visibility backend
       */
      identityProviders?: string[];
    };
  };
}
