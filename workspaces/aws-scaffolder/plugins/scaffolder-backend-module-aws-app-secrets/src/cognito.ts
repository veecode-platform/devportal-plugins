import {
  CognitoIdentityProviderClient,
  CreateUserPoolClientCommand,
  DescribeUserPoolClientCommand,
  ListUserPoolClientsCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { WriterCredentials } from './secretsManager';

const LIST_PAGE_SIZE = 60;
/** Cognito allows 1000 app clients per pool, so this many pages is never reached. */
const LIST_MAX_PAGES = 50;

/**
 * The scopes an app client may ask for. `aws.cognito.signin.user.admin` stays
 * out: it lets a signed-in user change their own e-mail address, and the
 * proxy trusts that address.
 */
export const LOGIN_SCOPES = ['openid', 'email', 'profile'];

export interface AppClientCredentials {
  clientId: string;
  clientSecret: string;
}

export function cognitoClient(
  region: string,
  credentials: WriterCredentials,
): CognitoIdentityProviderClient {
  return new CognitoIdentityProviderClient({
    region,
    // A retried CreateUserPoolClient would make a second client of the same name.
    maxAttempts: 1,
    credentials,
  });
}

/** The IDs of every client in the pool that carries this name, across all pages. */
export async function findClientIdsByName(
  client: CognitoIdentityProviderClient,
  userPoolId: string,
  clientName: string,
): Promise<string[]> {
  const ids: string[] = [];
  let nextToken: string | undefined;
  for (let page = 0; page < LIST_MAX_PAGES; page++) {
    const response = await client
      .send(
        new ListUserPoolClientsCommand({
          UserPoolId: userPoolId,
          MaxResults: LIST_PAGE_SIZE,
          NextToken: nextToken,
        }),
      )
      .catch((error: unknown) => {
        throw cognitoFailure('ListUserPoolClients', error);
      });
    for (const item of response.UserPoolClients ?? []) {
      if (item.ClientName === clientName && item.ClientId) {
        ids.push(item.ClientId);
      }
    }
    nextToken = response.NextToken;
    if (!nextToken) {
      return ids;
    }
  }
  throw new Error(
    `ListUserPoolClients did not end after ${LIST_MAX_PAGES} pages`,
  );
}

/** The secret of an existing client, for the values a half-finished run left unwritten. */
export async function describeClientSecret(
  client: CognitoIdentityProviderClient,
  userPoolId: string,
  clientId: string,
): Promise<string> {
  const response = await client
    .send(
      new DescribeUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
      }),
    )
    .catch((error: unknown) => {
      throw cognitoFailure('DescribeUserPoolClient', error);
    });
  const secret = response.UserPoolClient?.ClientSecret;
  if (!secret) {
    throw new Error(
      'DescribeUserPoolClient returned no client secret: the client was not created with one',
    );
  }
  return secret;
}

/**
 * Creates the app client the login proxy of one app signs in with: the
 * authorization code flow only, the three scopes above, refresh through the
 * proxy only, and e-mail as the one attribute the client may write.
 */
export async function createAppClient(
  client: CognitoIdentityProviderClient,
  options: {
    userPoolId: string;
    clientName: string;
    appUrl: string;
    identityProviders: string[];
  },
): Promise<AppClientCredentials> {
  const response = await client
    .send(
      new CreateUserPoolClientCommand({
        UserPoolId: options.userPoolId,
        ClientName: options.clientName,
        GenerateSecret: true,
        AllowedOAuthFlows: ['code'],
        AllowedOAuthFlowsUserPoolClient: true,
        AllowedOAuthScopes: LOGIN_SCOPES,
        SupportedIdentityProviders: options.identityProviders,
        ReadAttributes: ['email', 'email_verified'],
        WriteAttributes: ['email'],
        RefreshTokenValidity: 8,
        AccessTokenValidity: 60,
        IdTokenValidity: 60,
        TokenValidityUnits: {
          RefreshToken: 'hours',
          AccessToken: 'minutes',
          IdToken: 'minutes',
        },
        ExplicitAuthFlows: ['ALLOW_REFRESH_TOKEN_AUTH'],
        PreventUserExistenceErrors: 'ENABLED',
        EnableTokenRevocation: true,
        CallbackURLs: [`${options.appUrl}/oauth2/callback`],
        LogoutURLs: [`${options.appUrl}/`],
      }),
    )
    .catch((error: unknown) => {
      throw cognitoFailure('CreateUserPoolClient', error);
    });
  const created = response.UserPoolClient;
  if (!created?.ClientId || !created.ClientSecret) {
    throw new Error(
      'CreateUserPoolClient returned no client ID or client secret',
    );
  }
  return { clientId: created.ClientId, clientSecret: created.ClientSecret };
}

function cognitoFailure(operation: string, error: unknown): Error {
  return new Error(
    `${operation} failed: ${
      error instanceof Error ? error.name : 'unknown error'
    }`,
  );
}
