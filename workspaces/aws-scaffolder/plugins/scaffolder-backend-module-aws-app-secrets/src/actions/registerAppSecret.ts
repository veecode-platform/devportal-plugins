import { stringifyEntityRef } from '@backstage/catalog-model';
import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import type { Tag } from '@aws-sdk/client-secrets-manager';
import type { AppSecretsDependencies } from '../dependencies';
import { assertDeclared, declaredNames } from '../declaration';
import { parseSystemRef, requireOwnedSystem } from '../ownership';
import {
  awsName,
  AWS_NAME_MAX_LENGTH,
  buildSecretPath,
  checkSecretName,
  pathIdentity,
} from '../names';
import { writeSecret, writerClient } from '../secretsManager';

export const REGISTER_APP_SECRET_ACTION_ID =
  'aws:secrets-manager:app-secret:register';
const DEFAULT_VALUE_SECRET = 'value';

export function createRegisterAppSecretAction(deps: AppSecretsDependencies) {
  const { settings } = deps;

  return createTemplateAction({
    id: REGISTER_APP_SECRET_ACTION_ID,
    description:
      'Writes one secret of an app to AWS Secrets Manager. The value is read from the task secrets, never from the input. An existing secret gets a new version.',
    schema: {
      input: z =>
        z
          .object({
            app: z.string({
              description:
                'Entity reference of the app: system:<namespace>/<name>.',
            }),
            environment: z.string({
              description: 'One of the configured environments.',
            }),
            name: z.string({
              description:
                'Secret name: upper case letters, digits and underscores.',
            }),
            valueSecret: z
              .string({
                description:
                  'Key in the task secrets that holds the value. The value itself is never an input. Defaults to "value".',
              })
              .optional(),
          })
          .strict(),
      output: z =>
        z.object({
          path: z.string(),
          versionId: z.string(),
          created: z.boolean(),
        }),
    },
    async handler(ctx) {
      const { app, environment, name } = ctx.input;
      const valueSecret = ctx.input.valueSecret ?? DEFAULT_VALUE_SECRET;
      const appRef = parseSystemRef(app);
      const appName = stringifyEntityRef(appRef);

      if (!settings.environments.includes(environment)) {
        throw new Error(
          `environment "${environment}" is not configured; configured: ${settings.environments.join(
            ', ',
          )}`,
        );
      }
      checkSecretName(name, settings);

      const credentials = await ctx.getInitiatorCredentials();
      const { system, user } = await requireOwnedSystem({
        ...deps,
        app: appRef,
        credentials,
      });
      const identity = pathIdentity(system, settings.pathPattern);
      const declared = await declaredNames({
        ...deps,
        system,
        environment,
        declarationFile: settings.declarationFile,
        credentials,
      });
      assertDeclared(name, declared, {
        system: appName,
        environment,
        declarationFile: settings.declarationFile,
      });

      const value = ctx.secrets?.[valueSecret];
      if (!value) {
        throw new Error(`the task secret "${valueSecret}" holds no value`);
      }

      const path = buildSecretPath(settings.pathPattern, {
        ...identity,
        environment,
        name,
        cluster: settings.cluster,
      });
      const client = await writerClient({
        region: settings.region,
        roleArn: settings.writerRoleArn,
        roleSessionName: awsName(`task-${ctx.task.id}`, AWS_NAME_MAX_LENGTH),
        sourceIdentity: awsName(user.name, AWS_NAME_MAX_LENGTH),
      });
      const result = await writeSecret(client, {
        path,
        value,
        tags: registrationTags({
          registeredBy: user.entityRef,
          registeredAt: deps.now(),
          app: system.metadata.name,
          environment,
        }),
      });

      ctx.output('path', path);
      ctx.output('versionId', result.versionId);
      ctx.output('created', result.created);
      ctx.logger.info(
        `app secret ${name} for ${appName} in ${environment}: ${
          result.created ? 'created' : 'updated'
        }`,
      );
    },
  });
}

function registrationTags(options: {
  registeredBy: string;
  registeredAt: Date;
  app: string;
  environment: string;
}): Tag[] {
  return [
    { Key: 'veecode.io/registered-by', Value: options.registeredBy },
    {
      Key: 'veecode.io/registered-at',
      Value: options.registeredAt.toISOString(),
    },
    { Key: 'veecode.io/app', Value: options.app },
    { Key: 'veecode.io/environment', Value: options.environment },
  ];
}
