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
import type { ComponentType } from 'react';
import { RegisterAComponentSection } from '../components/HeaderDropdownComponent/RegisterAComponentSection';
import { SoftwareTemplatesSection } from '../components/HeaderDropdownComponent/SoftwareTemplatesSection';
import {
  CreateDropdownMountPoint,
  GlobalHeaderComponentMountPoint,
} from '../types';
import { Divider } from '../components/Divider/Divider';
import { CompanyLogo } from '../components/CompanyLogo/CompanyLogo';
import { NotificationButton } from '../components/NotificationButton/NotificationButton';
import { StarredDropdown } from '../components/HeaderDropdownComponent/StarredDropdown';
import { HeaderIconButton, HeaderIconButtonProps } from '../components/HeaderIconButton/HeaderIconButton';

const HeaderIconButtonCreate: React.FC<Partial<HeaderIconButtonProps>> = ({
  title = 'Create...',
  icon = 'add',
  to = 'create',
  ...rest
}) => <HeaderIconButton title={title} icon={icon} to={to} {...rest} />;

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
        priority: 50,
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
      Component: HeaderIconButtonCreate,
      config: {
        priority: 60, // the greater the number, the more to the left it will be
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
