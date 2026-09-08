/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *   http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import express from 'express';
import request from 'supertest';
import { ConfigReader } from '@backstage/config';
import { mockCredentials, mockServices } from '@backstage/backend-test-utils';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  CacheService,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { CostInsightsAwsService } from './types';
import { readCostInsightsAwsConfig } from '../config';

const mockCostInsightsAwsService: jest.Mocked<CostInsightsAwsService> = {
  getCatalogEntityRangeCost: jest.fn(),
  getCatalogEntityDailyCost: jest.fn(),
  listProjects: jest.fn(),
  getProjectDailyCost: jest.fn(),
  getOrgDailyCost: jest.fn(),
};

// A CacheService whose `get` always resolves to a stored response, used to
// prove that a cache hit cannot bypass the permission gate above it. The
// underlying `get` mock is returned alongside so a test can assert it was
// never even called.
function buildPrimedCache(body: unknown): {
  cache: CacheService;
  get: jest.Mock;
} {
  const get = jest.fn().mockResolvedValue(JSON.stringify(body));
  const primed: Partial<CacheService> = {
    get,
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  const cache = mockServices.cache.mock({
    withOptions: jest.fn().mockReturnValue(primed),
  });

  return { cache, get };
}

async function buildApp(options: {
  permissions: PermissionsService;
  cacheEnable?: boolean;
  cache?: CacheService;
}): Promise<express.Express> {
  const config = readCostInsightsAwsConfig(
    new ConfigReader({
      aws: {
        costInsights: {
          cache: { enable: options.cacheEnable ?? false },
        },
      },
    }),
  );

  const router = await createRouter({
    logger: mockServices.logger.mock(),
    costInsightsAwsService: mockCostInsightsAwsService,
    httpAuth: mockServices.httpAuth.mock({
      credentials: jest.fn().mockResolvedValue(mockCredentials.user()),
    }),
    cache: options.cache ?? mockServices.cache.mock(),
    config,
    rootConfig: new ConfigReader({}),
    permissions: options.permissions,
  });

  return express().use(router);
}

describe('createRouter', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /health', () => {
    it('is not gated by permissions', async () => {
      const app = await buildApp({
        permissions: mockServices.permissions({
          result: AuthorizeResult.DENY,
        }),
      });

      const response = await request(app).get('/health');

      expect(response.status).toEqual(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('GET /v1/projects', () => {
    it('returns 403 when the cost-insights-aws.cost.read permission is denied', async () => {
      const app = await buildApp({
        permissions: mockServices.permissions({
          result: AuthorizeResult.DENY,
        }),
      });

      const response = await request(app).get('/v1/projects');

      expect(response.status).toEqual(403);
      expect(mockCostInsightsAwsService.listProjects).not.toHaveBeenCalled();
    });

    it('returns 200 when the cost-insights-aws.cost.read permission is allowed', async () => {
      mockCostInsightsAwsService.listProjects.mockResolvedValue([
        { id: '111111111111', name: 'dev' },
      ]);

      const app = await buildApp({
        permissions: mockServices.permissions({
          result: AuthorizeResult.ALLOW,
        }),
      });

      const response = await request(app).get('/v1/projects');

      expect(response.status).toEqual(200);
      expect(response.body).toEqual({
        projects: [{ id: '111111111111', name: 'dev' }],
      });
    });

    it('returns 403 for a DENY caller even when the cache already holds a response', async () => {
      // The cache is primed with a stored 200 body. If the permission check
      // ran after (or was bypassed by) the cache middleware, this request
      // would come back 200 with the cached body instead of 403.
      const { cache, get: primedGet } = buildPrimedCache({
        projects: [{ id: '111111111111', name: 'dev' }],
      });

      const app = await buildApp({
        permissions: mockServices.permissions({
          result: AuthorizeResult.DENY,
        }),
        cacheEnable: true,
        cache,
      });

      const response = await request(app).get('/v1/projects');

      expect(response.status).toEqual(403);
      expect(response.body).not.toEqual({
        projects: [{ id: '111111111111', name: 'dev' }],
      });
      // The cache middleware sits behind the permission gate, so a DENY
      // must short-circuit before the cache is ever read.
      expect(primedGet).not.toHaveBeenCalled();
    });
  });

  describe('GET /v1/org/:intervals', () => {
    it('returns 403 when the cost-insights-aws.cost.read permission is denied', async () => {
      const app = await buildApp({
        permissions: mockServices.permissions({
          result: AuthorizeResult.DENY,
        }),
      });

      const response = await request(app).get('/v1/org/R2%2FP30D%2F2024-01-31');

      expect(response.status).toEqual(403);
      expect(mockCostInsightsAwsService.getOrgDailyCost).not.toHaveBeenCalled();
    });

    it('returns 200 with the org-wide cost when allowed', async () => {
      const orgCost = { id: 'org', aggregation: [], change: { ratio: 0, amount: 0 } };
      mockCostInsightsAwsService.getOrgDailyCost.mockResolvedValue(orgCost as any);

      const app = await buildApp({
        permissions: mockServices.permissions({
          result: AuthorizeResult.ALLOW,
        }),
      });

      const response = await request(app).get('/v1/org/R2%2FP30D%2F2024-01-31');

      expect(response.status).toEqual(200);
      expect(response.body).toEqual(orgCost);
      expect(mockCostInsightsAwsService.getOrgDailyCost).toHaveBeenCalledWith(
        expect.objectContaining({ intervals: 'R2/P30D/2024-01-31' }),
      );
    });
  });
});
