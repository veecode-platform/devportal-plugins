# @veecode-platform/backstage-plugin-ldap-auth-backend

> LDAP Authentication backend for [Backstage](https://backstage.io/)

This package provides LDAP authentication capabilities for your Backstage instance using the new backend system.

## About This Plugin

This is a **maintained fork** of the original [`@immobiliarelabs/backstage-plugin-ldap-auth-backend`](https://github.com/immobiliare/backstage-plugin-ldap-auth), updated and adapted for:

- ✅ **Latest Backstage releases** (v1.45+)
- ✅ **New backend system** architecture
- ✅ **Latest auth APIs** (`@backstage/plugin-auth-node` v0.6+)
- ✅ **Modern authentication patterns**

### Credits

Original plugin created by the amazing team at [ImmobiliareLabs](https://github.com/immobiliare). We are grateful for their work and maintain this fork to ensure compatibility with the latest Backstage releases.

📚 **[Original Plugin Documentation](https://github.com/immobiliare/backstage-plugin-ldap-auth)**

## Features

- **Customizable Authentication**: Inject custom authentication logic and response marshaling
- **Scalable**: Works with in-memory or PostgreSQL-based token storage for multi-instance deployments
- **Custom JWT Token Management**: Built-in token validation and invalidation
- **Custom Endpoints**: `/refresh` and `/logout` routes for token management
- **Session Management**: Automatic token refresh and expiry handling

## Prerequisites

This plugin works in conjunction with:

- **[@backstage/plugin-catalog-backend-module-ldap](https://www.npmjs.com/package/@backstage/plugin-catalog-backend-module-ldap)** - Syncs LDAP users/groups with Backstage catalog
- **[@veecode-platform/backstage-plugin-ldap-auth](../ldap-auth)** - Frontend login page and token management

## Table of Contents

- [@veecode-platform/backstage-plugin-ldap-auth-backend](#veecode-platformbackstage-plugin-ldap-auth-backend)
  - [About This Plugin](#about-this-plugin)
    - [Credits](#credits)
  - [Features](#features)
  - [Prerequisites](#prerequisites)
  - [Table of Contents](#table-of-contents)
  - [Installation](#installation)
  - [Configuration](#configuration)
    - [LDAP Connection](#ldap-connection)
    - [Backend Registration](#backend-registration)
    - [Token Storage (Optional)](#token-storage-optional)
  - [Custom LDAP Logic](#custom-ldap-logic)
    - [Custom Authentication Function](#custom-authentication-function)
    - [Custom User Existence Check](#custom-user-existence-check)
  - [Testing](#testing)
    - [Login/Refresh Token](#loginrefresh-token)
    - [Refresh with Existing Token](#refresh-with-existing-token)
    - [Logout](#logout)
  - [Migration from Original Plugin](#migration-from-original-plugin)
  - [Support \& Contributing](#support--contributing)
  - [Thanks](#thanks)
  - [License](#license)

## Installation

Install both backend and frontend plugins:

```bash
# Backend plugin
yarn workspace backend add @veecode-platform/backstage-plugin-ldap-auth-backend

# Frontend plugin
yarn workspace app add @veecode-platform/backstage-plugin-ldap-auth

# LDAP catalog sync (if not already installed)
yarn workspace backend add @backstage/plugin-catalog-backend-module-ldap
```

## Configuration

### LDAP Connection

Add LDAP configuration to your `app-config.yaml`. The configuration format remains **unchanged** from the original plugin:

```yaml
auth:
  providers:
    ldap:
      # Environment-specific configuration (e.g., development, production)
      development:
        cookies:
          secure: false # Set to true for HTTPS
          field: 'backstage-token'

        ldapAuthenticationOptions:
          userSearchBase: 'ou=People,dc=example,dc=com' # REQUIRED
          usernameAttribute: 'uid' # User unique identifier attribute
          
          # Admin credentials for user validation
          # If omitted, credential-less search will be attempted
          adminDn: 'cn=admin,dc=example,dc=com'
          adminPassword: '${LDAP_SECRET}'
          
          ldapOpts:
            url: '${LDAP_URL}' # e.g., 'ldap://localhost:389' or 'ldaps://ldap.example.com:636'
            tlsOptions:
              rejectUnauthorized: false # Set to true in production
```

**Environment Variables:**

```bash
export LDAP_URL="ldap://localhost:389"
export LDAP_SECRET="admin-password"
```

> **Note:** This plugin uses [`ldap-authentication`](https://github.com/shaozi/ldap-authentication) for LDAP operations. The `ldapOpts` are passed to [`ldapjs`](https://github.com/ldapjs/node-ldapjs).

### Backend Registration

Register the LDAP auth module in your backend. The **new backend system** makes this simple:

**`packages/backend/src/index.ts`**

```typescript
import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

// ... other plugins

// Auth backend is required
backend.add(import('@backstage/plugin-auth-backend'));

// Add LDAP auth module
backend.add(import('@veecode-platform/backstage-plugin-ldap-auth-backend'));

// ... other plugins

backend.start();
```

That's it! The plugin automatically:

- Registers `/api/auth/ldap/refresh` endpoint (login & token refresh)
- Registers `/api/auth/ldap/logout` endpoint (invalidate token)
- Uses in-memory token storage by default

### Token Storage (Optional)

By default, tokens are stored **in-memory**. For production or multi-instance deployments, use **PostgreSQL**:

```typescript
import { createBackend } from '@backstage/backend-defaults';
import { tokenValidatorFactory, JWTTokenValidator } from '@veecode-platform/backstage-plugin-ldap-auth-backend';
import Keyv from 'keyv';

const backend = createBackend();

// ... other plugins


backend.add(import('@backstage/plugin-auth-backend'));
backend.add(import('@veecode-platform/backstage-plugin-ldap-auth-backend'));

// Add PostgreSQL token storage
backend.add(
  tokenValidatorFactory({
    createTokenValidator: (config) => {
      const dbUrl = config.getString('backend.database.connection.url');
      return new JWTTokenValidator(
        new Keyv(dbUrl, { table: 'ldap_tokens' })
      );
    },
  })
);

backend.start();
```

## Custom LDAP Logic

You can customize the authentication flow and user validation logic using backend modules.

### Custom Authentication Function

Override the default LDAP authentication logic:

```typescript
import { coreServices, createBackendModule } from '@backstage/backend-plugin-api';
import { ldapAuthExtensionPoint } from '@veecode-platform/backstage-plugin-ldap-auth-backend';

export default createBackendModule({
  pluginId: 'auth',
  moduleId: 'ldap-custom',
  register(reg) {
    reg.registerInit({
      deps: {
        config: coreServices.rootConfig,
        ldapAuth: ldapAuthExtensionPoint,
      },
      async init({ config, ldapAuth }) {
        ldapAuth.set({
          resolvers: {
            async ldapAuthentication(
              username,
              password,
              ldapOptions,
              authFunction
            ) {
              // Customize LDAP options or authentication logic
              console.log(`Authenticating user: ${username}`);
              
              // Call the default auth function with modified options
              const user = await authFunction(ldapOptions);
              
              // Return user identifier
              return { uid: user.uid };
            },
          },
        });
      },
    });
  },
});
```

Then register it in `backend/src/index.ts`:

```typescript
backend.add(import('./modules/ldap-custom'));
```

### Custom User Existence Check

Customize how the plugin validates if a user exists in LDAP (used for JWT token validation):

```typescript
export default createBackendModule({
  pluginId: 'auth',
  moduleId: 'ldap-custom',
  register(reg) {
    reg.registerInit({
      deps: {
        config: coreServices.rootConfig,
        ldapAuth: ldapAuthExtensionPoint,
      },
      async init({ config, ldapAuth }) {
        ldapAuth.set({
          resolvers: {
            async checkUserExists(
              ldapAuthOptions,
              searchFunction
            ) {
              const { username } = ldapAuthOptions;
              
              // Add custom validation logic
              console.log(`Checking if user exists: ${username}`);
              
              // Use the default search function or implement your own
              const exists = await searchFunction(ldapAuthOptions);
              
              return exists;
            },
          },
        });
      },
    });
  },
});
```

## Testing

You can test the LDAP authentication endpoints directly:

### Login/Refresh Token

```bash
curl -X POST http://localhost:7007/api/auth/ldap/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your-ldap-username",
    "password": "your-ldap-password"
  }' \
  -c cookies.txt \
  -v
```

### Refresh with Existing Token

```bash
curl -X POST http://localhost:7007/api/auth/ldap/refresh \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -v
```

### Logout

```bash
curl -X POST http://localhost:7007/api/auth/ldap/logout \
  -b cookies.txt \
  -v
```

## Migration from Original Plugin

If you're migrating from `@immobiliarelabs/backstage-plugin-ldap-auth-backend`:

1. **Update package name** in `package.json`:

   ```diff
   - "@immobiliarelabs/backstage-plugin-ldap-auth-backend": "^4.3.1"
   + "@veecode-platform/backstage-plugin-ldap-auth-backend": "workspace:*"
   ```

2. **Update imports** in `backend/src/index.ts`:

   ```diff
   - backend.add(import('@immobiliarelabs/backstage-plugin-ldap-auth-backend'));
   + backend.add(import('@veecode-platform/backstage-plugin-ldap-auth-backend'));
   ```

3. **Configuration remains the same** - no changes needed in `app-config.yaml`

4. **New backend system** - the plugin now uses the modern Backstage backend architecture

## Support & Contributing

This is a community-maintained fork. For issues or questions:

- **This fork**: [GitHub Issues](https://github.com/veecode-platform/devportal-plugins/issues)
- **Original plugin**: [ImmobiliareLabs/backstage-plugin-ldap-auth](https://github.com/immobiliare/backstage-plugin-ldap-auth)

## Thanks

Original plugin created with ❤️ by the [ImmobiliareLabs](https://github.com/immobiliare) team.

Maintained and updated by [VeeCode Platform](https://github.com/veecode-platform).

---

## License

MIT License - see [LICENSE](../../LICENSE) for details.

Original work Copyright (c) ImmobiliareLabs  
Modified work Copyright (c) VeeCode Platform
