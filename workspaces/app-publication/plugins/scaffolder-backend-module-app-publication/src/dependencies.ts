import type {
  AuthService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import type { AppPublicationSettings } from './config';
import type { FetchFunction, GitlabConnection } from './gitlab';

export interface Clock {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

/** The GitLab integrations of the portal, as ScmIntegrations exposes them. */
export interface GitlabIntegrations {
  byHost(host: string): { config: GitlabConnection } | undefined;
}

export interface PublicationDependencies {
  auth: AuthService;
  catalog: CatalogService;
  userInfo: UserInfoService;
  settings: AppPublicationSettings;
  gitlabIntegrations: GitlabIntegrations;
  fetch: FetchFunction;
  clock: Clock;
  /** The portal's base address, for the link to the app's catalog page. */
  appBaseUrl?: string;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: milliseconds =>
    new Promise(resolve => {
      setTimeout(resolve, milliseconds);
    }),
};
