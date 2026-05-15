import { createFrontendModule, ApiBlueprint } from '@backstage/frontend-plugin-api';
import { kubernetesAuthProvidersApiRef } from '@backstage/plugin-kubernetes';
import { KubernetesAuthProviders, ServerSideKubernetesAuthProvider } from '@backstage/plugin-kubernetes-react';
import { OAuthApi, OpenIdConnectApi } from '@backstage/core-plugin-api';
import {
  gitlabAuthApiRef,
  googleAuthApiRef,
  microsoftAuthApiRef,
  oktaAuthApiRef,
  oneloginAuthApiRef,
} from '@backstage/core-plugin-api';

/**
 * Server-side Kubernetes auth provider for 'veecodeauth'.
 * 
 * This implementation only handles 'veecodeauth'. All other providers are handled
 * by the default Kubernetes plugin implementation via auto-discovery.
 */
class VeecodeKubernetesAuthProviders extends KubernetesAuthProviders /* implements KubernetesAuthProvidersApi */ {
  constructor(options: {
    microsoftAuthApi: OAuthApi;
    googleAuthApi: OAuthApi;
    oidcProviders?: { [key: string]: OpenIdConnectApi };
  }) {
    super(options);
    // get backstage config

    // Access private kubernetesAuthProviderMap to register custom provider
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).kubernetesAuthProviderMap.set(
      'veecodeauth',
      new ServerSideKubernetesAuthProvider(),
    );
  }
  
  /*
  async decorateRequestBodyForAuth(
    authProvider: string,
    requestBody: any,
  ): Promise<any> {
    // For server-side 'veecodeauth', just pass through - backend handles it
    if (authProvider === 'veecodeauth') {
      return requestBody;
    }
    // This shouldn't happen - other providers are handled by the default implementation
    throw new Error(
      `VeecodeKubernetesAuthProvider only handles 'veecodeauth', got '${authProvider}'`,
    );
  }

  async getCredentials(authProvider: string): Promise<{ token?: string }> {
    // For server-side 'veecodeauth', return empty - backend provides credentials
    if (authProvider === 'veecodeauth') {
      return {};
    }
    // This shouldn't happen - other providers are handled by the default implementation
    throw new Error(
      `VeecodeKubernetesAuthProvider only handles 'veecodeauth', got '${authProvider}'`,
    );
  }
  */
}

/**
 * Frontend module that registers 'veecodeauth' as a server-side Kubernetes auth provider.
 * This matches the backend auth strategy registered in kubernetes-backend-module-getsecret.
 */
export const veecodeKubernetesAuthModule = createFrontendModule({
  pluginId: 'kubernetes',
  extensions: [
    /*
    ApiBlueprint.make({
      name: 'auth-providers',
      params: defineParams => defineParams(createApiFactory({
        api: kubernetesAuthProvidersApiRef,
        deps: {},
        factory: () => new VeecodeKubernetesAuthProvider(),
      })),
    }),
    */
    // COPIED FROM 
    ApiBlueprint.make({
      name: 'auth-providers',
      params: defineParams =>
        defineParams({
          api: kubernetesAuthProvidersApiRef,
          deps: {
            gitlabAuthApi: gitlabAuthApiRef,
            googleAuthApi: googleAuthApiRef,
            microsoftAuthApi: microsoftAuthApiRef,
            oktaAuthApi: oktaAuthApiRef,
            oneloginAuthApi: oneloginAuthApiRef,
          },
          factory: ({
            gitlabAuthApi,
            googleAuthApi,
            microsoftAuthApi,
            oktaAuthApi,
            oneloginAuthApi,
          }) => {
            const oidcProviders = {
              gitlab: gitlabAuthApi,
              google: googleAuthApi,
              microsoft: microsoftAuthApi,
              okta: oktaAuthApi,
              onelogin: oneloginAuthApi,
            };

            return new VeecodeKubernetesAuthProviders({
              microsoftAuthApi,
              googleAuthApi,
              oidcProviders,
            });
          },
        }),
    })
  ],
});
