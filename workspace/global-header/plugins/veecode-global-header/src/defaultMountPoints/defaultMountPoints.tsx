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
 * 
 */

/*
 * This file has been modified by Veecode Platform to define a default
 * behaviour for the Global Header when linked statically.
 * 
 * Modifications are also licensed under the Apache License, Version 2.0.
 */

import type { ComponentType } from 'react';
import { RegisterAComponentSection } from '../components/HeaderDropdownComponent/RegisterAComponentSection';
import { SoftwareTemplatesSection } from '../components/HeaderDropdownComponent/SoftwareTemplatesSection';
import {
  CreateDropdownMountPoint,
  GlobalHeaderComponentMountPoint,
  ProfileDropdownMountPoint,
} from '../types';
import { Divider } from '../components/Divider/Divider';
import { CompanyLogo } from '../components/CompanyLogo/CompanyLogo';
import { NotificationButton } from '../components/NotificationButton/NotificationButton';
import { StarredDropdown } from '../components/HeaderDropdownComponent/StarredDropdown';
import { ToggleThemeButton } from '../components/ToggleThemeButton/ToggleThemeButton';
import { MenuItemLink } from '../components/MenuItemLink/MenuItemLink';
import { LogoutButton } from '../components/LogoutButton/LogoutButton';
import { ProfileDropdown } from '../components/HeaderDropdownComponent/ProfileDropdown';
import { SearchComponent } from '../components/SearchComponent/SearchComponent';
import { Spacer } from '../components/Spacer/Spacer';

/**
 * default Global Header Components mount points
 *
 * @public
 */
export const defaultGlobalHeaderComponentsMountPoints: GlobalHeaderComponentMountPoint[] =
  [
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
    {
      Component: CompanyLogo,
      config: {
        priority: 200,
        props: {
          to: '/catalog',
          // logo: {
          //   light: 'https://veecode-platform.github.io/support/logos/logo.svg',
          //   dark: 'https://veecode-platform.github.io/support/logos/logo-black.svg',
          // },
        },
      },
    },
    {
      Component: Divider,
      config: {
        priority: 55, // the greater the number, the more to the left it will be
        props: {
          growFactor: 0,
        },
      },
    },
    {
      Component: NotificationButton,
      config: {
        priority: 60, // the greater the number, the more to the left it will be
        props: {
          growFactor: 0,
        },
      },
    },
    {
      Component: StarredDropdown,
      config: {
        priority: 70, // the greater the number, the more to the left it will be
        props: {
          growFactor: 0,
        },
      },
    },
    {
      Component: ToggleThemeButton,
      config: {
        priority: 75, // the greater the number, the more to the left it will be
        props: {
          growFactor: 0,
        },
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
        title: 'profile.settings',
        icon: 'profile',
        link: '/settings',
      },
    },
  },
  {
    Component: MenuItemLink as ComponentType,
    config: {
      priority: 150,
      props: {
        title: 'profile.myProfile',
        icon: 'person',
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
