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

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useUserProfile } from '@backstage/plugin-user-settings';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { parseEntityRef, UserEntity } from '@backstage/catalog-model';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import KeyboardArrowDownOutlinedIcon from '@mui/icons-material/KeyboardArrowDownOutlined';
import Avatar from '@mui/material/Avatar';
import Typography from '@mui/material/Typography';
import { lighten } from '@mui/material/styles';
import Box from '@mui/material/Box';

import { MenuSection } from './MenuSection';
import { HeaderDropdownComponent } from './HeaderDropdownComponent';
import { useProfileDropdownMountPoints } from '../../hooks/useProfileDropdownMountPoints';
import { useDropdownManager } from '../../hooks';
import { useTranslation } from '../../hooks/useTranslation';

/**
 * @public
 * Props for Profile Dropdown
 */
export interface ProfileDropdownProps {
  layout?: CSSProperties;
}

export const ProfileDropdown = ({ layout }: ProfileDropdownProps) => {
  console.log('ProfileDropdown rendering started');
  const { anchorEl, handleOpen, handleClose } = useDropdownManager();
  const [user, setUser] = useState<string | null>();
  const [profileLink, setProfileLink] = useState<string | null>();
  const { t } = useTranslation();
  const {
    displayName,
    backstageIdentity,
    profile,
    loading: profileLoading,
  } = useUserProfile();
  const catalogApi = useApi(catalogApiRef);

  const profileDropdownMountPoints = useProfileDropdownMountPoints();

  // const headerRef = useRef<HTMLElement | null>(null);
  const [bgColor, setBgColor] = useState('#3C3F42');
  const [userEntityStatus, setUserEntityStatus] = useState<'idle' | 'loading' | 'found' | 'missing'>('idle');

  /*
  useEffect(() => {
    if (headerRef.current) {
      const computedStyle = window.getComputedStyle(headerRef.current);
      const baseColor = computedStyle.backgroundColor;
      setBgColor(lighten(baseColor, 0.2));
    }
  }, []);
  */

  useEffect(() => {
    const container = document.getElementById('global-header') as HTMLElement | null;
    if (container) {
      const baseColor = window.getComputedStyle(container).backgroundColor;
      setBgColor(lighten(baseColor, 0.2));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchUserEntity = async () => {
      if (!backstageIdentity?.userEntityRef) {
        setUser(null);
        setProfileLink(null);
        setUserEntityStatus('missing');
        return;
      }
      setUserEntityStatus('loading');
      try {
        const { namespace = 'default', name } = parseEntityRef(backstageIdentity.userEntityRef);
        const profileUrl = `/catalog/${namespace}/user/${name}`;
        const userProfile = (await catalogApi.getEntityByRef(backstageIdentity.userEntityRef)) as unknown as UserEntity | undefined;
        if (!cancelled && userProfile) {
            setUser(userProfile?.spec?.profile?.displayName ?? userProfile?.metadata?.title ?? null);
            setProfileLink(profileUrl);
            setUserEntityStatus('found');
        } else if (!cancelled) {
            setUser(null);
            setProfileLink(null);
            setUserEntityStatus('missing');
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setProfileLink(null);
          setUserEntityStatus('missing');
        }
      }
    };
    fetchUserEntity();
    return () => { cancelled = true; };
  }, [backstageIdentity, catalogApi]);

  const isGuestUser = useMemo(() => {
    if (userEntityStatus === 'loading') return false; // suppress flicker
    const ref = backstageIdentity?.userEntityRef ?? '';
    // Match ":guest" or "/guest" at end (namespace/userName or entityRef tail)
    const explicitGuest = /(^|[/:])guest$/i.test(ref);
    return explicitGuest || userEntityStatus === 'missing';
  }, [backstageIdentity, userEntityStatus]);

  const menuItems = useMemo(() => {
    return (profileDropdownMountPoints ?? [])
      .map(mp => {
        const { title = '', icon = '', link: staticLink = '', type = '' } = mp.config?.props ?? {};
        const isMyProfile = type === 'myProfile';
        const link = isMyProfile ? (profileLink || '') : staticLink;

        if (isMyProfile && isGuestUser) return null;
        if (!link && title && !isMyProfile) return null;

        const translatedTitle = title?.includes('.') ? (t(title as any, {}) || title) : title;

        return {
          Component: mp.Component,
          label: translatedTitle,
          link,
          priority: mp.config?.priority ?? 0,
          ...(icon && { icon }),
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b!.priority ?? 0) - (a!.priority ?? 0));
  }, [profileDropdownMountPoints, profileLink, isGuestUser, t]);

  console.log('isGuestUser stable:', isGuestUser, userEntityStatus);

  if (menuItems.length === 0) {
    return null;
  }

  const profileDisplayName = () => {
    const name = user ?? displayName;
    const regex = /^[^:/]+:[^/]+\/[^/]+$/;
    if (regex.test(name)) {
      return name
        .charAt(name.indexOf('/') + 1)
        .toLocaleUpperCase('en-US')
        .concat(name.substring(name.indexOf('/') + 2));
    }
    return name;
  };

  return (
    <HeaderDropdownComponent
      buttonContent={
        <Box sx={{ display: 'flex', alignItems: 'center', ...layout }}>
          {!profileLoading && (
            <>
              {profile.picture ? (
                <Avatar
                  src={profile.picture}
                  sx={{ mr: 2, height: '32px', width: '32px' }}
                  alt={t('profile.picture')}
                />
              ) : (
                <AccountCircleOutlinedIcon fontSize="small" sx={{ mr: 1 }} />
              )}
              <Typography
                variant="body2"
                sx={{
                  display: { xs: 'none', md: 'block' },
                  fontWeight: 500,
                  mr: '1rem',
                }}
              >
                {profileDisplayName()}
              </Typography>
            </>
          )}
          <KeyboardArrowDownOutlinedIcon
            sx={{
              bgcolor: bgColor,
              borderRadius: '25%',
            }}
          />
        </Box>
      }
      buttonProps={{
        color: 'inherit',
        sx: {
          display: 'flex',
          alignItems: 'center',
        },
      }}
      onOpen={handleOpen}
      onClose={handleClose}
      anchorEl={anchorEl}
    >
      <MenuSection hideDivider items={menuItems} handleClose={handleClose} />
    </HeaderDropdownComponent>
  );
};