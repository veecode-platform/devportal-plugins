// addDefaultKubernetesAuthStrategies.ts

/*
 This code exists because when adding a custom k8s auth strategy for some reason
 all default strategies get nuked. This adds the default strategies too.

 This is conditionallt called by the module initialization.
*/

import { Config } from '@backstage/config';
import { LoggerService } from '@backstage/backend-plugin-api';
import type { AuthenticationStrategy } from '@backstage/plugin-kubernetes-node';
import {
  AwsIamStrategy,
  AksStrategy,
  AzureIdentityStrategy,
  GoogleStrategy,
  GoogleServiceAccountStrategy,
  OidcStrategy,
  AnonymousStrategy,
} from '@backstage/plugin-kubernetes-backend';

// The extension point type has an addAuthStrategy(key, strategy) method.
// We accept a simple interface so this helper stays decoupled from internals.
export interface AuthStrategyRegistrar {
  addAuthStrategy: (key: string, strategy: AuthenticationStrategy) => void;
}

/**
 * Re-add Backstage's stock Kubernetes auth strategies.
 * Call this BEFORE registering any custom strategy so you keep the defaults.
 */
export function addDefaultKubernetesAuthStrategies(
  registrar: AuthStrategyRegistrar,
  config: Config,
  logger: LoggerService
) {
  const defaults: Record<string, AuthenticationStrategy> = {
    google: new GoogleStrategy(),
    googleServiceAccount: new GoogleServiceAccountStrategy({ config }),
    aws: new AwsIamStrategy({ config }),
    aks: new AksStrategy(),
    azureIdentity: new AzureIdentityStrategy(logger),
    // will be registered by veecode module
    // serviceAccount: new ServiceAccountStrategy(),
    oidc: new OidcStrategy(),
    localKubectlProxy: new AnonymousStrategy(),
  };

  for (const [key, strategy] of Object.entries(defaults)) {
    registrar.addAuthStrategy(key, strategy);
  }
}
