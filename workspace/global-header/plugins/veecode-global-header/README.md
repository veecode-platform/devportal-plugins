# global-header

Welcome to the global-header plugin.

## Getting started

This plugin defines a global header for VeeCode DevPortal (an open-source Backstage distro).

Look for VeeCode DevPortal documentation to learn how to install and configure this plugin:

- [VeeCode DevPortal Customization](https://docs.platform.vee.codes/devportal/customization/)
- [VeeCode DevPortal Global Header Documentation](https://docs.platform.vee.codes/devportal/customization/custom-header)

## Requirements

This plugin requires other standard plugins to be installed in order to work properly:

- Notifications plugin: the `NotificationButton` component is used to display notifications in the global header.
- Signals plugin: in order to show notifications in real time, `NotificationButton` also requires the Signals plugin (it is optional, but required for real time notifications).

Both plugins are included by default in VeeCode DevPortal (statically linked).

If you disable the `NotificationButton` component in the global header configuration, then you don't need to install these plugins.

## Static configuration

To statically configure the global header using its defaults you need to add the following import to `Root.tsx`:

```tsx
import { 
  GlobalHeaderComponent, 
  defaultGlobalHeaderComponentsMountPoints 
} from '@veecode-platform/plugin-veecode-global-header';
```

And then you can add the `GlobalHeaderComponent` accondingly to your needs:

```tsx
      <div id="rhdh-above-sidebar-header-container">
        {/* update globalHeaderMountPoints config to test Global header */}
        <GlobalHeaderComponent
          globalHeaderMountPoints={defaultGlobalHeaderComponentsMountPoints}
        />
      </div>
```

## Dynamic configuration

To dynamically configure the global header using its defaults you need to add a dynamicPlugins snippet like this:

```yaml
dynamicPlugins:
  rootDirectory: dynamic-plugins-root
  frontend:
    veecode-platform.plugin-veecode-global-header:
      mountPoints:
        - mountPoint: application/header
          importName: GlobalHeader
          config:
            position: above-sidebar # above-main-content | above-sidebar
```

There are several extension points available to customize the global header. You can disable buttons, change icons and logos, and more. Look for more details in the [VeeCode DevPortal Global Header Documentation](https://docs.platform.vee.codes/devportal/customization/custom-header).

## Source code

This plugin is part of the [VeeCode DevPortal Plugins Repository](https://github.com/veecode-platform/devportal-plugins).

