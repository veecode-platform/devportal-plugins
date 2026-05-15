# Global Header Plugin

This is the global header plugin for VeeCode DevPortal.

## Development

To start the app, run:

```sh
yarn install
yarn start
```

## Extra Notes

### Icons

Notice the `defaultMountPoints.tsx` file in "global-header" workspace - it shows how a custom plugin refers to icons using a name (string). This reproduces this plugin's dynamic configuration (wich can also set custom plugins).

Backstage "vanilla" includes a set of system icons that can be used by plugins and referenced by a name. Check [Backstage default system icons](https://github.com/backstage/backstage/blob/master/packages/app-defaults/src/defaults/icons.tsx) for the default icon list.

However, any Backstage distro can define its own set of icons. VeeCode DevPortal includes a few more plugins to this list.

In the case of VeeCode DevPortal, due to its support for dynamic plugins, any plugin can also add its own icons to the system without the need for a new DevPortal build.

We have included a "Show icons" button in the global header hosting app to help you debug icon loading issues.
