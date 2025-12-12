# [Backstage](https://backstage.io)

This is the hosting Backstage App for the ldap auth plugins.

## Requirements

Start a local LDAP server using `vkdr`:

```sh
vkdr infra start --nodeports=2
vkdr nginx install --default-ic
vkdr openldap install --ldap-admin
```

The `vkdr` CLI will start an openldap server with a custom user and group structure ready for this example. You can test it using `ldapsearch`:

```sh
ldapsearch -H ldap://localhost:9000 \
  -x -D "cn=admin,dc=vee,dc=codes" -w admin -b "dc=vee,dc=codes"
```

The web UI (phpLDAPadmin) is available at `http://ldap.localhost:8000/`.

## Quick start

To start the app, set the environment variables and run:

```sh
export LDAP_URL="ldap://localhost:9000"
export LDAP_DN="cn=admin,dc=vee,dc=codes"
export LDAP_SECRET="admin"
export LDAP_USERS_BASE_DN="ou=People,dc=vee,dc=codes"
export LDAP_GROUPS_BASE_DN="ou=Groups,dc=vee,dc=codes"
yarn install
yarn start
```

## Plugins

The plugins are located in the `plugins` folder.

This project also relies on the `@backstage/plugin-catalog-backend-module-ldap` plugin for the catalog provider (org sync).

### LDAP auth backend plugin

The LDAP backend plugin is located in the `plugins/ldap-auth-backend` folder.

The backend plugin is configured in the `app-config.yaml` file.

To test the backend plugin directly:

```sh
curl -X POST http://localhost:7007/api/auth/ldap/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "username": "young",
    "password": "vert1234"
  }' \
  -c /tmp/cookies.txt \
  -v
```
