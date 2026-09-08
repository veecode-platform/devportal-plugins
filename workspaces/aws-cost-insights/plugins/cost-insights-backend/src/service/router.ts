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
import Router from 'express-promise-router';
import { CostInsightsAwsService } from './types';
import {
  CacheService,
  HttpAuthService,
  LoggerService,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { NotAllowedError } from '@backstage/errors';
import { costInsightsAwsReadPermission } from '@aws/cost-insights-plugin-for-backstage-common';
import { CostInsightsCache } from '../cache';
import { CostInsightsAwsConfig } from '../config';
import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { Config } from '@backstage/config';

export interface RouterOptions {
  logger: LoggerService;
  costInsightsAwsService: CostInsightsAwsService;
  httpAuth: HttpAuthService;
  cache: CacheService;
  config: CostInsightsAwsConfig;
  rootConfig: Config;
  permissions: PermissionsService;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const {
    logger,
    costInsightsAwsService,
    config,
    cache,
    httpAuth,
    rootConfig,
    permissions,
  } = options;

  const router = Router();
  router.use(express.json());

  // Gate every /v1/* route behind the cost-insights-aws.cost.read
  // permission. This is registered as router-level middleware ahead of the
  // cache layer below (not inlined per-handler) so a DENY is rejected
  // *before* the cache middleware ever gets a chance to serve a cached
  // response — a cache hit must never bypass authorization. Mounting on
  // '/v1' also structurally excludes /health, which stays unauthenticated.
  router.use('/v1', (request, _response, next) => {
    httpAuth
      .credentials(request)
      .then(credentials =>
        permissions.authorize(
          [{ permission: costInsightsAwsReadPermission }],
          { credentials },
        ),
      )
      .then(([decision]) => {
        if (decision.result === AuthorizeResult.DENY) {
          throw new NotAllowedError();
        }
        next();
      })
      .catch(next);
  });

  let cacheClient: CostInsightsCache | undefined;
  if (config.cache.enable) {
    cacheClient = CostInsightsCache.fromConfig(config, { cache, logger });

    router.use((req, res, next) => {
      const cacheKey = req.originalUrl;

      if (cacheClient) {
        cacheClient.get(cacheKey).then(e => {
          if (e) {
            res.send(JSON.parse(e));
          } else {
            const originalJson = res.json;
            res.json = data => {
              if (cacheClient) {
                cacheClient.set(cacheKey, JSON.stringify(data));
              }
              return originalJson.call(res, data);
            };
            next();
          }
        });
      }
    });
  }

  router.get(
    '/v1/entity/:namespace/:kind/:name/:intervals',
    async (request, response) => {
      const { namespace, kind, name, intervals } = request.params;

      const data = await costInsightsAwsService.getCatalogEntityDailyCost({
        entityRef: {
          kind,
          namespace,
          name,
        },
        intervals,
        credentials: await httpAuth.credentials(request),
      });

      response.status(200).json(data);
    },
  );

  router.get('/v1/projects', async (request, response) => {
    const projects = await costInsightsAwsService.listProjects({
      credentials: await httpAuth.credentials(request),
    });

    response.status(200).json({ projects });
  });

  router.get('/v1/project/:project/:intervals', async (request, response) => {
    const { project, intervals } = request.params;

    // Projects are AWS account ids; reject anything else before it reaches
    // the Cost Explorer filter.
    if (!/^\d{12}$/.test(project)) {
      response
        .status(400)
        .json({ error: 'project must be a 12-digit AWS account id' });
      return;
    }

    const data = await costInsightsAwsService.getProjectDailyCost({
      project,
      intervals,
      credentials: await httpAuth.credentials(request),
    });

    response.status(200).json(data);
  });

  router.get('/v1/org/:intervals', async (request, response) => {
    const { intervals } = request.params;

    const data = await costInsightsAwsService.getOrgDailyCost({
      intervals,
      credentials: await httpAuth.credentials(request),
    });

    response.status(200).json(data);
  });

  router.get('/health', (_, response) => {
    logger.info('PONG!');
    response.json({ status: 'ok' });
  });

  const middleware = MiddlewareFactory.create({ logger, config: rootConfig });
  router.use(middleware.error());

  return router;
}

export * from './CostExplorerCostInsightsAwsService';
