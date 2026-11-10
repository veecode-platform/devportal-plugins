import type { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import type { LoginSettings } from '../config';
import type { AppSecretsDependencies } from '../dependencies';
import {
  appCallbackUrl,
  cognitoClient,
  createAppClient,
  describeAppClient,
  findClientIdsByName,
} from '../cognito';
import { newCookieSecret } from '../cookieSecret';
import {
  checkLoginIdentity,
  loginAppUrl,
  loginClientName,
  type LoginNameParts,
} from '../loginNames';
import {
  CLIENT_ID_TAG,
  LOGIN_SECRET_NAMES,
  type LoginPlan,
  type LoginSecretName,
  planLoginClient,
} from '../loginPlan';
import {
  awsName,
  AWS_NAME_MAX_LENGTH,
  buildSecretPath,
  DEFAULT_NAMESPACE,
  refPathIdentity,
} from '../names';
import { findOwnedSystem, parseSystemRef } from '../ownership';
import {
  assumeWriterRole,
  createSecretOnce,
  inspectSecret,
  registrationTags,
  type SecretPresence,
  secretsManagerClient,
} from '../secretsManager';
import { loginSessionPolicy } from '../sessionPolicy';

export const ENSURE_APP_LOGIN_CLIENT_ACTION_ID =
  'aws:cognito:app-login-client:ensure';

export function createEnsureAppLoginClientAction(deps: AppSecretsDependencies) {
  const { settings } = deps;

  return createTemplateAction({
    id: ENSURE_APP_LOGIN_CLIENT_ACTION_ID,
    description:
      "Makes sure an app has its own Cognito app client in the configured user pool, and that the client ID, client secret and cookie secret its login proxy reads exist under the app's secret path. It never overwrites a value that exists. The secrets are never returned.",
    schema: {
      input: z =>
        z
          .object({
            app: z.string({
              description:
                'Entity reference of the app: system:<namespace>/<name>. The System may not be in the catalog yet; if it is, the caller must own it.',
            }),
            environment: z
              .string({
                description:
                  'One of the configured environments. Defaults to the first one.',
              })
              .optional(),
          })
          .strict(),
      output: z =>
        z.object({
          clientId: z.string({
            description: 'The ID of the app client. It is not a secret.',
          }),
          created: z.boolean({
            description: 'Whether this run created the app client.',
          }),
          secretNames: z.array(z.string(), {
            description: 'The names of the three secrets the proxy reads.',
          }),
        }),
    },
    async handler(ctx) {
      const login = settings.login;
      if (!login) {
        throw new Error(
          'appSecrets.login is not configured: set appSecrets.login.userPoolId and appSecrets.login.appUrlPattern to create app login clients',
        );
      }
      const environment = ctx.input.environment ?? settings.environments[0];
      const appRef = parseSystemRef(ctx.input.app);
      if (!settings.environments.includes(environment)) {
        throw new Error(
          `environment "${environment}" is not configured; configured: ${settings.environments.join(
            ', ',
          )}`,
        );
      }

      const credentials = await ctx.getInitiatorCredentials();
      const { system, user } = await findOwnedSystem({
        ...deps,
        app: appRef,
        credentials,
      });
      const identity = system
        ? {
            name: system.metadata.name,
            namespace: system.metadata.namespace ?? DEFAULT_NAMESPACE,
          }
        : { name: appRef.name, namespace: appRef.namespace };
      const nameParts: LoginNameParts = {
        app: identity.name,
        environment,
        namespace: identity.namespace,
      };
      checkLoginIdentity(nameParts);
      const secretIdentity = refPathIdentity(identity, settings.pathPattern);
      if (
        identity.namespace !== DEFAULT_NAMESPACE &&
        !login.clientNamePattern.includes('{namespace}')
      ) {
        throw new Error(
          `System "${stringifyEntityRef(
            appRef,
          )}" is outside the "${DEFAULT_NAMESPACE}" namespace, and appSecrets.login.clientNamePattern has no {namespace}: it would share a login client with a System of the same name in "${DEFAULT_NAMESPACE}". Add {namespace} to appSecrets.login.clientNamePattern to create it.`,
        );
      }
      const clientName = loginClientName(login.clientNamePattern, nameParts);
      const appUrl = loginAppUrl(login.appUrlPattern, nameParts);
      const secretPaths = Object.fromEntries(
        LOGIN_SECRET_NAMES.map(name => [
          name,
          buildSecretPath(settings.pathPattern, {
            ...secretIdentity,
            environment,
            name,
            cluster: settings.cluster,
          }),
        ]),
      ) as Record<LoginSecretName, string>;

      const writer = await assumeWriterRole({
        region: settings.region,
        roleArn: settings.writerRoleArn,
        roleSessionName: awsName(`task-${ctx.task.id}`, AWS_NAME_MAX_LENGTH),
        sourceIdentity: awsName(user.name, AWS_NAME_MAX_LENGTH),
        policy: loginSessionPolicy({
          secretsRegion: settings.region,
          secretPaths: Object.values(secretPaths),
          userPoolRegion: login.region,
          userPoolId: login.userPoolId,
        }),
      });
      const secrets = secretsManagerClient(settings.region, writer);
      const cognito = cognitoClient(login.region, writer);

      const clientIds = await findClientIdsByName(
        cognito,
        login.userPoolId,
        clientName,
      );
      const presence = {} as Record<LoginSecretName, SecretPresence>;
      for (const name of LOGIN_SECRET_NAMES) {
        presence[name] = await inspectSecret(secrets, secretPaths[name]);
      }
      const plan = planLoginClient({
        clientName,
        clientIds,
        systemInCatalog: system !== undefined,
        secrets: presence,
      });

      const { clientId, missing, values } = await settle(plan, {
        cognito,
        login,
        clientName,
        appUrl,
        randomBytes: deps.randomBytes,
      });

      const tags = [
        ...registrationTags({
          registeredBy: user.entityRef,
          registeredAt: deps.now(),
          app: identity.name,
          environment,
        }),
        { Key: CLIENT_ID_TAG, Value: clientId },
      ];
      for (const name of missing) {
        await createSecretOnce(secrets, {
          path: secretPaths[name],
          value: values[name] as string,
          tags,
        }).catch((error: unknown) => {
          throw new Error(
            `${
              error instanceof Error ? error.message : 'CreateSecret failed'
            }. The client named "${clientName}" exists; run the step again to write the values still missing`,
          );
        });
      }

      ctx.output('clientId', clientId);
      ctx.output('created', plan.kind === 'create');
      ctx.output('secretNames', [...LOGIN_SECRET_NAMES]);
      ctx.logger.info(
        `app login client ${clientName} for ${stringifyEntityRef(
          appRef,
        )} in ${environment}: ${describeOutcome(plan.kind, missing.length)}`,
      );
    },
  });
}

type Values = Partial<Record<LoginSecretName, string>>;

async function settle(
  plan: LoginPlan,
  context: {
    cognito: CognitoIdentityProviderClient;
    login: LoginSettings;
    clientName: string;
    appUrl: string;
    randomBytes: (size: number) => Buffer;
  },
): Promise<{
  clientId: string;
  missing: LoginSecretName[];
  values: Values;
}> {
  const { cognito, login, randomBytes } = context;
  if (plan.kind === 'create') {
    const created = await createAppClient(cognito, {
      userPoolId: login.userPoolId,
      clientName: context.clientName,
      appUrl: context.appUrl,
      identityProviders: login.identityProviders,
    });
    return {
      clientId: created.clientId,
      missing: [...LOGIN_SECRET_NAMES],
      values: {
        OAUTH2_PROXY_CLIENT_ID: created.clientId,
        OAUTH2_PROXY_CLIENT_SECRET: created.clientSecret,
        OAUTH2_PROXY_COOKIE_SECRET: newCookieSecret(randomBytes),
      },
    };
  }

  const existing = await describeAppClient(
    cognito,
    login.userPoolId,
    plan.clientId,
  );
  const callbackUrl = appCallbackUrl(context.appUrl);
  if (
    existing.callbackUrls.length !== 1 ||
    existing.callbackUrls[0] !== callbackUrl
  ) {
    throw new Error(
      `the client named "${context.clientName}" in the user pool does not belong to this app: its callback URL is not the one of this app; refusing to use it`,
    );
  }
  if (plan.kind === 'existing') {
    return { clientId: plan.clientId, missing: [], values: {} };
  }

  const values: Values = { OAUTH2_PROXY_CLIENT_ID: plan.clientId };
  if (plan.missing.includes('OAUTH2_PROXY_CLIENT_SECRET')) {
    if (!existing.clientSecret) {
      throw new Error(
        'DescribeUserPoolClient returned no client secret: the client was not created with one',
      );
    }
    values.OAUTH2_PROXY_CLIENT_SECRET = existing.clientSecret;
  }
  if (plan.missing.includes('OAUTH2_PROXY_COOKIE_SECRET')) {
    values.OAUTH2_PROXY_COOKIE_SECRET = newCookieSecret(randomBytes);
  }
  return { clientId: plan.clientId, missing: plan.missing, values };
}

function describeOutcome(
  kind: 'create' | 'existing' | 'complete',
  written: number,
): string {
  switch (kind) {
    case 'create':
      return `created, ${written} secrets written`;
    case 'complete':
      return `existing, ${written} missing secrets written`;
    default:
      return 'existing, nothing to write';
  }
}
