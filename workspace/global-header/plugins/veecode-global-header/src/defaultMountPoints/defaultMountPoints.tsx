/*
 * Copyright Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import type { CSSProperties, ComponentType } from 'react';
import { LogoutButton } from '../components/LogoutButton/LogoutButton';
import { CreateDropdown } from '../components/HeaderDropdownComponent/CreateDropdown';
import { ProfileDropdown } from '../components/HeaderDropdownComponent/ProfileDropdown';
import { RegisterAComponentSection } from '../components/HeaderDropdownComponent/RegisterAComponentSection';
import { SoftwareTemplatesSection } from '../components/HeaderDropdownComponent/SoftwareTemplatesSection';
import { SearchComponent } from '../components/SearchComponent/SearchComponent';
import { SupportButton } from '../components/SupportButton/SupportButton';
import {
  ApplicationLauncherDropdownMountPoint,
  CreateDropdownMountPoint,
  GlobalHeaderComponentMountPoint,
  HelpDropdownMountPoint,
  ProfileDropdownMountPoint,
} from '../types';
import { NotificationButton } from '../components/NotificationButton/NotificationButton';
import { Divider } from '../components/Divider/Divider';
import { MenuItemLink } from '../components/MenuItemLink/MenuItemLink';
import { Spacer } from '../components/Spacer/Spacer';
import { StarredDropdown } from '../components/HeaderDropdownComponent/StarredDropdown';
import { ApplicationLauncherDropdown } from '../components/HeaderDropdownComponent/ApplicationLauncherDropdown';
import { CompanyLogo } from '../components/CompanyLogo/CompanyLogo';
import { HelpDropdown } from '../components/HeaderDropdownComponent/HelpDropdown';
import { ToggleThemeButton } from '../components/ToggleThemeButton/ToggleThemeButton'

/**
 * default Global Header Components mount points
 *
 * @public
 */
export const defaultGlobalHeaderComponentsMountPoints: GlobalHeaderComponentMountPoint[] =
  [
    {
      Component: CompanyLogo,
      config: {
        priority: 200,
        props: {
          to: '/catalog'
        },
      },
    },
    {
      Component: SearchComponent,
      config: {
        priority: 100, // the greater the number, the more to the left it will be
      },
    },
    {
      Component: Spacer,
      config: {
        priority: 99, // the greater the number, the more to the left it will be
        props: {
          growFactor: 0,
        },
      },
    },
    // Notice: 1.5 ships with a Create link instead of a dropdown!!!
    {
      Component: CreateDropdown,
      config: {
        priority: 90,
        layout: {
          display: {
            sm: 'none',
            md: 'block',
          },
          mr: 1.5,
        } as any as CSSProperties, // I don't used MUI v5 specific `sx` types here to allow us changing the implementation later
      },
    },
    {
      Component: StarredDropdown,
      config: {
        priority: 85,
      },
    },
    {
      Component: ApplicationLauncherDropdown,
      config: {
        priority: 82,
      },
    },
    {
      Component: HelpDropdown,
      config: {
        priority: 80,
      },
    },
    {
      Component: NotificationButton,
      config: {
        priority: 70,
      },
    },
    {
      Component: ToggleThemeButton,
      config: {
        priority: 75, 
      },
    },
    {
      Component: Divider,
      config: {
        priority: 50,
      },
    },
    {
      Component: ProfileDropdown,
      config: {
        priority: 10, // the greater the number, the more to the left it will be
      },
    },
  ];

export const defaultCreateDropdownMountPoints: CreateDropdownMountPoint[] = [
  {
    Component: SoftwareTemplatesSection as ComponentType,
    config: {
      priority: 200,
    },
  },
  {
    Component: RegisterAComponentSection as ComponentType,
    config: {
      priority: 100,
    },
  },
];

export const defaultProfileDropdownMountPoints: ProfileDropdownMountPoint[] = [
  {
    Component: MenuItemLink as ComponentType,
    config: {
      priority: 200,
      props: {
        title: 'Settings',
        titleKey: 'profile.settings',
        link: '/settings',
        icon: 'manageAccounts',
      },
    },
  },
  {
    Component: MenuItemLink as ComponentType,
    config: {
      priority: 150,
      props: {
        title: 'My profile',
        titleKey: 'profile.myProfile',
        icon: 'account',
        type: 'myProfile', // Semantic identifier
      },
    },
  },
  {
    Component: LogoutButton,
    config: {
      priority: 100,
    },
  },
];

export const defaultHelpDropdownMountPoints: HelpDropdownMountPoint[] = [
  {
    Component: MenuItemLink as ComponentType,
    config: {
      priority: 100,
      props: {
        title: 'Quick start',
        titleKey: 'help.quickStart',
        icon: 'quickstart',
        link: 'https://docs.redhat.com/en/documentation/red_hat_developer_hub/latest/',
      },
    },
  },
  {
    Component: SupportButton,
    config: {
      priority: 10,
    },
  },
];

export const defaultApplicationLauncherDropdownMountPoints: ApplicationLauncherDropdownMountPoint[] =
  [
    {
      Component: MenuItemLink as ComponentType,
      config: {
        section: 'applicationLauncher.sections.documentation',
        priority: 150,
        props: {
          title: 'Developer Hub',
          titleKey: 'applicationLauncher.developerHub',
          icon: 'developerHub',
          link: 'https://docs.redhat.com/en/documentation/red_hat_developer_hub',
        },
      },
    },
    {
      Component: MenuItemLink as ComponentType,
      config: {
        section: 'applicationLauncher.sections.developerTools',
        priority: 130,
        props: {
          title: 'RHDH Local',
          titleKey: 'applicationLauncher.rhdhLocal',
          icon: 'developerHub',
          link: 'https://github.com/redhat-developer/rhdh-local',
        },
      },
    },
  ];
