# @veecode-platform/backstage-plugin-ldap-auth

> LDAP Authentication frontend for [Backstage](https://backstage.io/)

This package provides a custom LDAP login page and client-side token management for your Backstage instance.

## About This Plugin

This is a **maintained fork** of the original [`@immobiliarelabs/backstage-plugin-ldap-auth`](https://github.com/immobiliare/backstage-plugin-ldap-auth), updated and adapted for:

- ✅ **Latest Backstage releases** (v1.45+)
- ✅ **Material-UI v5** (migrated from v4)
- ✅ **Modern React patterns** (hooks, functional components)
- ✅ **TypeScript 5.x** support

### Credits

Original plugin created by the amazing team at [ImmobiliareLabs](https://github.com/immobiliare). We are grateful for their work and maintain this fork to ensure compatibility with the latest Backstage releases.

📚 **[Original Plugin Documentation](https://github.com/immobiliare/backstage-plugin-ldap-auth)**

## Features

- **Custom Login Page**: Material-UI based LDAP authentication form
- **Token Management**: Automatic token refresh and session handling
- **Customizable UI**: Pass children components to customize the look and feel
- **Password Validation**: Built-in username and password validation
- **Session Persistence**: Cookie-based session storage

## Prerequisites

This plugin works in conjunction with:

- **[@veecode-platform/backstage-plugin-ldap-auth-backend](../ldap-auth-backend)** - Backend authentication provider
- **[@backstage/plugin-catalog-backend-module-ldap](https://www.npmjs.com/package/@backstage/plugin-catalog-backend-module-ldap)** - Syncs LDAP users/groups with Backstage catalog

## Table of Contents

- [@veecode-platform/backstage-plugin-ldap-auth](#veecode-platformbackstage-plugin-ldap-auth)
  - [About This Plugin](#about-this-plugin)
    - [Credits](#credits)
  - [Features](#features)
  - [Prerequisites](#prerequisites)
  - [Table of Contents](#table-of-contents)
  - [Installation](#installation)
  - [Configuration](#configuration)
    - [Basic Setup](#basic-setup)
    - [Customization Options](#customization-options)
    - [Custom Children](#custom-children)
  - [Backend Configuration](#backend-configuration)
  - [Migration from Original Plugin](#migration-from-original-plugin)
  - [Support \& Contributing](#support--contributing)
  - [Thanks](#thanks)
  - [License](#license)

## Installation

Install both frontend and backend plugins:

```bash
# Frontend plugin
yarn workspace app add @veecode-platform/backstage-plugin-ldap-auth

# Backend plugin  
yarn workspace backend add @veecode-platform/backstage-plugin-ldap-auth-backend
```

## Configuration

### Basic Setup

Replace Backstage's default sign-in page with the LDAP login page in your app.

**`packages/app/src/App.tsx`**

```typescript
import { LdapAuthFrontendPage } from '@veecode-platform/backstage-plugin-ldap-auth';
import { createApp } from '@backstage/app-defaults';

const app = createApp({
  // ... other config
  components: {
    SignInPage: (props) => (
      <LdapAuthFrontendPage
        {...props}
        provider="ldap"
      />
    ),
  },
  // ... other config
});
```

> **Note:** This component handles both UI and authentication logic, including token management and API calls to the backend authentication routes.

### Customization Options

You can customize the login form with validation rules and helper text:

```typescript
const app = createApp({
  components: {
    SignInPage: (props) => (
      <LdapAuthFrontendPage
        {...props}
        provider="ldap"
        options={{
          // Custom labels
          usernameLabel: 'Employee ID',
          
          // Helper text
          helperTextUsername: "Enter your LDAP username (e.g., 'jsmith')",
          helperTextPassword: 'Enter your LDAP password',
          
          // Custom validation
          validateUsername: (username) => username.length >= 3,
          validatePassword: (password) => password.length >= 8,
        }}
      />
    ),
  },
});
```

**Available Options:**

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `usernameLabel` | `string` | Label for username field | `'LDAP Name'` |
| `helperTextUsername` | `string` | Helper text below username field | `undefined` |
| `helperTextPassword` | `string` | Helper text below password field | `undefined` |
| `validateUsername` | `(usr: string) => boolean` | Custom username validation | Min 4 chars, max 40, no spaces |
| `validatePassword` | `(pwd: string) => boolean` | Custom password validation | Min 4 chars, no spaces |

### Custom Children

The login page accepts children components to customize the UI (e.g., logos, banners, footer):

```typescript
const app = createApp({
  components: {
    SignInPage: (props) => (
      <LdapAuthFrontendPage {...props} provider="ldap">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/your-logo.png" alt="Logo" width={200} />
          <h2>Welcome to Our Portal</h2>
          <p>Please sign in with your LDAP credentials</p>
        </div>
      </LdapAuthFrontendPage>
    ),
  },
});
```

## Backend Configuration

Make sure to configure the backend plugin. See the [backend plugin documentation](../ldap-auth-backend) for details.

## Migration from Original Plugin

If you're migrating from `@immobiliarelabs/backstage-plugin-ldap-auth`:

1. **Update package name** in `package.json`:

   ```diff
   - "@immobiliarelabs/backstage-plugin-ldap-auth": "^4.3.1"
   + "@veecode-platform/backstage-plugin-ldap-auth": "workspace:*"
   ```

2. **Update imports** in `App.tsx`:

   ```diff
   - import { LdapAuthFrontendPage } from '@immobiliarelabs/backstage-plugin-ldap-auth';
   + import { LdapAuthFrontendPage } from '@veecode-platform/backstage-plugin-ldap-auth';
   ```

3. **Material-UI v5**: This fork uses MUI v5, which is already the standard in latest Backstage releases

4. **API remains the same** - no code changes needed beyond import updates

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
