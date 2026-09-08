/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  CostExplorerClient,
  Dimension,
  Expression,
  GetCostAndUsageCommand,
  GetDimensionValuesCommand,
  Granularity,
  GroupDefinition,
  GroupDefinitionType,
} from '@aws-sdk/client-cost-explorer';
import {
  COST_INSIGHTS_AWS_ACCOUNT_ID_ANNOTATION,
  COST_INSIGHTS_AWS_COST_CATEGORY_ANNOTATION,
  COST_INSIGHTS_AWS_TAGS_ANNOTATION,
} from '@aws/cost-insights-plugin-for-backstage-common';
import {
  ChangeStatistic,
  Cost,
  DateAggregation,
  Project,
  Trendline,
} from '@backstage-community/plugin-cost-insights-common';
import {
  AWS_SDK_CUSTOM_USER_AGENT,
  getOneOfEntityAnnotations,
} from '@aws/aws-core-plugin-for-backstage-common';
import {
  CompoundEntityRef,
  stringifyEntityRef,
} from '@backstage/catalog-model';
import { CostInsightsAwsService } from './types';
import {
  AwsCredentialsManager,
  DefaultAwsCredentialsManager,
} from '@backstage/integration-aws-node';
import {
  BackstageCredentials,
  coreServices,
  createServiceFactory,
  createServiceRef,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { AwsCredentialIdentityProvider } from '@aws-sdk/types';
import regression, { DataPoint } from 'regression';
import { CostInsightsAwsConfig } from '../config';
import { DateTime, Duration as LuxonDuration } from 'luxon';
import { readCostInsightsAwsConfig } from '../config';
import {
  catalogServiceRef,
  CatalogService,
} from '@backstage/plugin-catalog-node';

export class CostExplorerCostInsightsAwsService
  implements CostInsightsAwsService
{
  public constructor(
    private readonly logger: LoggerService,
    private readonly catalogService: CatalogService,
    private readonly costExplorerClient: CostExplorerClient,
    private readonly config: CostInsightsAwsConfig,
  ) {}

  static async fromConfig(
    config: CostInsightsAwsConfig,
    options: {
      catalogService: CatalogService;
      logger: LoggerService;
      credentialsManager: AwsCredentialsManager;
    },
  ) {
    const { region, accountId } = config.costExplorer;

    const { credentialsManager } = options;

    let credentialProvider: AwsCredentialIdentityProvider;

    if (accountId) {
      credentialProvider = (
        await credentialsManager.getCredentialProvider({ accountId })
      ).sdkCredentialProvider;
    } else {
      credentialProvider = (await credentialsManager.getCredentialProvider())
        .sdkCredentialProvider;
    }

    const costExplorerClient = new CostExplorerClient({
      region: region,
      customUserAgent: AWS_SDK_CUSTOM_USER_AGENT,
      credentialDefaultProvider: () => credentialProvider,
    });

    return new CostExplorerCostInsightsAwsService(
      options.logger,
      options.catalogService,
      costExplorerClient,
      config,
    );
  }

  public async getCatalogEntityRangeCost(options: {
    entityRef: CompoundEntityRef;
    startDate: Date;
    endDate: Date;
    granularity: Granularity;
    credentials: BackstageCredentials;
  }): Promise<Cost> {
    const { entityRef, credentials, startDate, endDate, granularity } = options;

    this.logger.debug(`Fetch ${granularity} costs for ${entityRef}`);

    const entity = await this.catalogService.getEntityByRef(entityRef, {
      credentials,
    });

    if (!entity) {
      throw new Error(
        `Couldn't find entity with name: ${stringifyEntityRef(entityRef)}`,
      );
    }

    const annotation = getOneOfEntityAnnotations(entity, [
      COST_INSIGHTS_AWS_COST_CATEGORY_ANNOTATION,
      COST_INSIGHTS_AWS_TAGS_ANNOTATION,
    ]);

    if (!annotation) {
      throw new Error('Annotation not found on entity');
    }

    let filter: Expression;

    const filterType =
      annotation.name === COST_INSIGHTS_AWS_TAGS_ANNOTATION
        ? 'Tags'
        : 'CostCategories';

    const filters: Expression[] = annotation.value.split(',').map(e => {
      const parts = e.split('=');

      return {
        [filterType]: {
          Key: parts[0],
          Values: [parts[1]],
        },
      };
    });

    // Optional, opt-in account scoping: read the annotation directly rather
    // than through getOneOfEntityAnnotations above — that helper requires
    // the intersection with its target list to have length exactly 1, so
    // adding this annotation to that call would break any entity that also
    // carries the tags/cost-category annotation.
    const accountId =
      entity.metadata.annotations?.[COST_INSIGHTS_AWS_ACCOUNT_ID_ANNOTATION];

    if (accountId !== undefined) {
      if (/^\d{12}$/.test(accountId)) {
        filters.push({
          Dimensions: {
            Key: Dimension.LINKED_ACCOUNT,
            Values: [accountId],
          },
        });
      } else {
        this.logger.warn(
          `Ignoring invalid ${COST_INSIGHTS_AWS_ACCOUNT_ID_ANNOTATION} annotation value "${accountId}" on ${stringifyEntityRef(
            entityRef,
          )}: expected a 12-digit AWS account id`,
        );
      }
    }

    if (filters.length > 1) {
      filter = {
        And: filters,
      };
    } else {
      filter = filters[0];
    }

    const costMetric = this.config.costExplorer.costMetric;

    const root = await this.getAggregations(
      entity.metadata.name,
      filter,
      costMetric,
      granularity,
      startDate,
      endDate,
    );

    const promises = [];

    const groupedCosts: Record<string, Cost[]> | undefined = {};

    for (const entityGroup of this.config.entityGroups) {
      if (entityGroup.kind === entity.kind) {
        for (const group of entityGroup.groups) {
          promises.push(
            this.getGroupedAggregations(
              filter,
              costMetric,
              [
                {
                  Type: group.type as GroupDefinitionType,
                  Key: group.key as GroupDefinition['Key'],
                },
              ],
              granularity,
              startDate,
              endDate,
            ).then(e => {
              return {
                name: group.name,
                costs: e,
              };
            }),
          );
        }
      }
    }

    await Promise.all(promises).then(values => {
      for (const result of values) {
        groupedCosts[result.name] = result.costs;
      }
    });

    root.groupedCosts = groupedCosts;

    return root;
  }

  public async getCatalogEntityDailyCost(options: {
    entityRef: CompoundEntityRef;
    intervals: string;
    credentials: BackstageCredentials;
  }): Promise<Cost> {
    const { startDate, endDate } = this.parseInterval(options.intervals);

    return this.getCatalogEntityRangeCost({
      ...options,
      startDate,
      endDate,
      granularity: Granularity.DAILY,
    });
  }

  public async listProjects(_options: {
    credentials?: BackstageCredentials;
  }): Promise<Project[]> {
    // Cost Insights "projects" map to AWS linked accounts. Only accounts with
    // usage inside the lookback window are returned, which also keeps the list
    // meaningful when the configured credentials point at a management account.
    const endDate = DateTime.now().toUTC();
    const startDate = endDate.minus(LuxonDuration.fromISO('P90D'));

    const projects: Project[] = [];
    let nextPageToken: string | undefined;

    do {
      const response = await this.costExplorerClient.send(
        new GetDimensionValuesCommand({
          Dimension: Dimension.LINKED_ACCOUNT,
          TimePeriod: {
            Start: this.formatDate(startDate.toJSDate()),
            End: this.formatDate(endDate.toJSDate()),
          },
          NextPageToken: nextPageToken,
        }),
      );

      for (const value of response.DimensionValues ?? []) {
        if (value.Value) {
          projects.push({
            id: value.Value,
            name: value.Attributes?.description,
          });
        }
      }

      nextPageToken = response.NextPageToken;
    } while (nextPageToken);

    return projects;
  }

  public async getProjectDailyCost(options: {
    project: string;
    intervals: string;
    credentials?: BackstageCredentials;
  }): Promise<Cost> {
    const { project, intervals } = options;

    this.logger.debug(`Fetch daily costs for account ${project}`);

    const { startDate, endDate } = this.parseInterval(intervals);

    const filter: Expression = {
      Dimensions: {
        Key: Dimension.LINKED_ACCOUNT,
        Values: [project],
      },
    };

    const costMetric = this.config.costExplorer.costMetric;

    const root = await this.getAggregations(
      project,
      filter,
      costMetric,
      Granularity.DAILY,
      startDate,
      endDate,
    );

    // Same mechanism as entities: an entityGroups entry with kind 'Project'
    // opts the per-account view into grouped costs (e.g. by SERVICE).
    const groupedCosts: Record<string, Cost[]> = {};

    const promises = [];
    for (const entityGroup of this.config.entityGroups) {
      if (entityGroup.kind === 'Project') {
        for (const group of entityGroup.groups) {
          promises.push(
            this.getGroupedAggregations(
              filter,
              costMetric,
              [
                {
                  Type: group.type as GroupDefinitionType,
                  Key: group.key as GroupDefinition['Key'],
                },
              ],
              Granularity.DAILY,
              startDate,
              endDate,
            ).then(e => {
              return {
                name: group.name,
                costs: e,
              };
            }),
          );
        }
      }
    }

    await Promise.all(promises).then(values => {
      for (const result of values) {
        groupedCosts[result.name] = result.costs;
      }
    });

    root.groupedCosts = groupedCosts;

    return root;
  }

  public async getOrgDailyCost(options: {
    intervals: string;
    credentials?: BackstageCredentials;
  }): Promise<Cost> {
    const { intervals } = options;

    this.logger.debug('Fetch org-wide daily costs');

    const { startDate, endDate } = this.parseInterval(intervals);

    const costMetric = this.config.costExplorer.costMetric;

    // No filter => whole configured Cost Explorer account/context, i.e.
    // whatever the configured costExplorer.accountId (or default credential
    // chain) principal's CE view covers.
    const root = await this.getAggregations(
      'org',
      undefined,
      costMetric,
      Granularity.DAILY,
      startDate,
      endDate,
    );

    // Same opt-in mechanism as getProjectDailyCost: an entityGroups entry
    // with kind 'Project' enables grouped costs (e.g. by SERVICE) for the
    // org-wide view too.
    const groupedCosts: Record<string, Cost[]> = {};

    const promises = [];
    for (const entityGroup of this.config.entityGroups) {
      if (entityGroup.kind === 'Project') {
        for (const group of entityGroup.groups) {
          promises.push(
            this.getGroupedAggregations(
              undefined,
              costMetric,
              [
                {
                  Type: group.type as GroupDefinitionType,
                  Key: group.key as GroupDefinition['Key'],
                },
              ],
              Granularity.DAILY,
              startDate,
              endDate,
            ).then(e => {
              return {
                name: group.name,
                costs: e,
              };
            }),
          );
        }
      }
    }

    await Promise.all(promises).then(values => {
      for (const result of values) {
        groupedCosts[result.name] = result.costs;
      }
    });

    root.groupedCosts = groupedCosts;

    return root;
  }

  private async getAggregations(
    id: string,
    filter: Expression | undefined,
    costMetric: string,
    granularity: Granularity,
    startDate: Date,
    endDate: Date,
  ): Promise<Cost> {
    const response = await this.costExplorerClient.send(
      new GetCostAndUsageCommand({
        TimePeriod: {
          Start: this.formatDate(endDate),
          End: this.formatDate(startDate),
        },
        Granularity: granularity,
        Metrics: [costMetric],
        Filter: filter,
      }),
    );

    const aggregation = response.ResultsByTime!.map(result => {
      return {
        date: result.TimePeriod!.Start!,
        amount: parseFloat(result.Total![costMetric].Amount!),
      };
    });

    return {
      id,
      aggregation,
      change: this.changeOf(aggregation),
      trendline: this.trendlineOf(aggregation),
    } as Cost;
  }

  private async getGroupedAggregations(
    filter: Expression | undefined,
    costMetric: string,
    groupBy: GroupDefinition[] | undefined,
    granularity: Granularity,
    startDate: Date,
    endDate: Date,
  ): Promise<Cost[]> {
    const response = await this.costExplorerClient.send(
      new GetCostAndUsageCommand({
        TimePeriod: {
          Start: this.formatDate(endDate),
          End: this.formatDate(startDate),
        },
        Granularity: granularity,
        Metrics: [costMetric],
        Filter: filter,
        GroupBy: groupBy,
      }),
    );

    const aggregations: Record<string, DateAggregation[]> = {};

    for (let i = 0; i < response.ResultsByTime!.length; i++) {
      const result = response.ResultsByTime![i];
      const resultDate = result.TimePeriod!.Start!;

      for (let j = 0; j < result.Groups!.length; j++) {
        const groupResult = result.Groups![j];

        const key = groupResult.Keys![0];

        if (!aggregations[key]) {
          aggregations[key] = [];
        }

        aggregations[key].push({
          date: resultDate,
          amount: parseFloat(groupResult.Metrics![costMetric].Amount!),
        });
      }
    }

    return Promise.resolve(
      Object.entries(aggregations).map(([k, v]) => {
        return {
          id: k,
          aggregation: v,
          change: undefined,
          trendline: undefined,
        } as Cost;
      }),
    );
  }

  private formatDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private parseInterval(intervals: string) {
    const parts = intervals.split('/');

    if (parts.length !== 3) {
      throw new Error(`Incorrect interval for ${intervals}`);
    }

    const regex = /R(\d+)/;
    const match = parts[0].match(regex);

    if (!match || !match[1]) {
      throw new Error(`Failed to parse repeating interval ${parts[0]}`);
    }

    const repeat = parseInt(match[1], 10);

    const duration = LuxonDuration.fromISO(parts[1]).mapUnits(x => x * repeat);

    const endDate = DateTime.fromISO(parts[2]);
    const startDate = endDate.minus(duration);

    return {
      endDate: startDate.toUTC().toJSDate(),
      startDate: endDate.toUTC().toJSDate(),
    };
  }

  private changeOf(aggregation: DateAggregation[]): ChangeStatistic {
    const firstAmount = aggregation.length ? aggregation[0].amount : 0;
    const lastAmount = aggregation.length
      ? aggregation[aggregation.length - 1].amount
      : 0;

    if (!firstAmount || !lastAmount) {
      return {
        amount: lastAmount - firstAmount,
      };
    }

    return {
      ratio: (lastAmount - firstAmount) / firstAmount,
      amount: lastAmount - firstAmount,
    };
  }

  private trendlineOf(aggregation: DateAggregation[]): Trendline {
    const data: ReadonlyArray<DataPoint> = aggregation.map(a => [
      Date.parse(a.date) / 1000,
      a.amount,
    ]);
    const result = regression.linear(data, { precision: 5 });
    return {
      slope: result.equation[0],
      intercept: result.equation[1],
    };
  }
}

export const costInsightsAwsServiceRef =
  createServiceRef<CostInsightsAwsService>({
    id: 'cost-insights-aws.api',
    defaultFactory: async service =>
      createServiceFactory({
        service,
        deps: {
          logger: coreServices.logger,
          config: coreServices.rootConfig,
          catalogService: catalogServiceRef,
        },
        async factory({ logger, config, catalogService }) {
          const pluginConfig = readCostInsightsAwsConfig(config);

          const impl = await CostExplorerCostInsightsAwsService.fromConfig(
            pluginConfig,
            {
              catalogService,
              logger,
              credentialsManager:
                DefaultAwsCredentialsManager.fromConfig(config),
            },
          );

          return impl;
        },
      }),
  });
