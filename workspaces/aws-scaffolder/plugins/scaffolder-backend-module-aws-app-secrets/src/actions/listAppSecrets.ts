import type { ActionsRegistryService } from '@backstage/backend-plugin-api/alpha';
import { stringifyEntityRef } from '@backstage/catalog-model';
import type { AppSecretsDependencies } from '../dependencies';
import { declaredNames } from '../declaration';
import { parseSystemRef, requireOwnedSystem } from '../ownership';
import {
  awsName,
  AWS_NAME_MAX_LENGTH,
  buildSecretPath,
  checkSecretName,
} from '../names';
import {
  describeSecret,
  type SecretState,
  writerClient,
} from '../secretsManager';

export const LIST_APP_SECRETS_ACTION_NAME = 'list-app-secrets';
const LIST_SESSION_NAME = LIST_APP_SECRETS_ACTION_NAME;

/**
 * Metadata only: DescribeSecret is the one Secrets Manager call this action makes.
 */
export function registerListAppSecretsAction(
  actionsRegistry: ActionsRegistryService,
  deps: AppSecretsDependencies,
): void {
  const { settings } = deps;

  actionsRegistry.register({
    name: LIST_APP_SECRETS_ACTION_NAME,
    title: 'List app secrets',
    description:
      'Lists the secrets an app declares for each configured environment and whether each one has a value, with the time it last changed. It never returns a value.',
    schema: {
      input: z =>
        z
          .object({
            app: z.string({
              description:
                'Entity reference of the app: system:<namespace>/<name>.',
            }),
          })
          .strict(),
      output: z =>
        z.object({
          environments: z
            .record(
              z.string(),
              z.record(
                z.string(),
                z.object({
                  hasValue: z.boolean(),
                  lastChangedDate: z
                    .string({
                      description:
                        'When the value last changed, as an ISO time. Absent when there is no value.',
                    })
                    .optional(),
                }),
              ),
            )
            .describe(
              'For each configured environment, each declared secret name and its state.',
            ),
        }),
    },
    attributes: { readOnly: true, idempotent: true },
    async action({ input, credentials, logger }) {
      const appRef = parseSystemRef(input.app);
      const { system, user } = await requireOwnedSystem({
        ...deps,
        app: appRef,
        credentials,
      });
      const client = await writerClient({
        region: settings.region,
        roleArn: settings.writerRoleArn,
        roleSessionName: awsName(LIST_SESSION_NAME, AWS_NAME_MAX_LENGTH),
        sourceIdentity: awsName(user.name, AWS_NAME_MAX_LENGTH),
      });

      const environments: Record<string, Record<string, SecretState>> = {};
      for (const environment of settings.environments) {
        const declared = await declaredNames({
          ...deps,
          system,
          environment,
          declarationFile: settings.declarationFile,
          credentials,
        });
        const states: Record<string, SecretState> = {};
        for (const name of [...declared].sort()) {
          try {
            checkSecretName(name, settings);
          } catch (error) {
            logger.warn(
              `skipped the declared name "${name}" of ${stringifyEntityRef(
                appRef,
              )}: ${error instanceof Error ? error.message : 'invalid name'}`,
            );
            continue;
          }
          const path = buildSecretPath(settings.pathPattern, {
            app: system.metadata.name,
            environment,
            name,
            cluster: settings.cluster,
          });
          states[name] = await describeSecret(client, path);
        }
        environments[environment] = states;
      }

      return { output: { environments } };
    },
  });
}
