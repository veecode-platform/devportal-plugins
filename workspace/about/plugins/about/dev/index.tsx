import { createDevApp } from '@backstage/dev-utils';
import { aboutPlugin, AboutPage } from '../src/plugin';
import { aboutApiRef } from '../src/api';
import type { AboutApi } from '../src/api';
import type { DevPortalInfo } from '../src/types';

const mockAboutApi: AboutApi = {
  async getInfo(): Promise<DevPortalInfo> {
    return {
      operatingSystem: 'dev-host: Linux 6.1.0 - linux/x64',
      resourceUtilization: 'Memory: 4096/16384MB - Load: 0.50/0.30/0.20',
      nodeJsVersion: process.version ?? 'v20.0.0',
      backstageVersion: '1.48.2',
      devportalVersion: '0.1.0',
    };
  },
};

createDevApp()
  .registerPlugin(aboutPlugin)
  .registerApi({
    api: aboutApiRef,
    deps: {},
    factory: () => mockAboutApi,
  })
  .addPage({
    element: <AboutPage />,
    title: 'About',
    path: '/about',
  })
  .render();
