import type { AppSecretsSettings } from './config';
import type { DeclarationServices } from './declaration';
import type { OwnershipServices } from './ownership';

export interface AppSecretsDependencies
  extends OwnershipServices,
    DeclarationServices {
  settings: AppSecretsSettings;
  now(): Date;
  /** The random source for generated secrets; `crypto.randomBytes` in the backend. */
  randomBytes(size: number): Buffer;
}
