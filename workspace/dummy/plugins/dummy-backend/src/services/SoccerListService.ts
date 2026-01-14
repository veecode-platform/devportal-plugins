import {
  coreServices,
  createServiceFactory,
  createServiceRef,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { Expand } from '@backstage/types';

export type SoccerTeam = {
  id: string;
  name: string;
  country: string;
};

export type SoccerTeamsResponse = {
  teams: SoccerTeam[];
};

export class SoccerListService {
  readonly #logger: LoggerService;

  static create(options: { logger: LoggerService }) {
    return new SoccerListService(options.logger);
  }

  private constructor(logger: LoggerService) {
    this.#logger = logger;
  }

  async listTeams(): Promise<SoccerTeamsResponse> {
    const result: SoccerTeamsResponse = {
      teams: [
        { id: 'arsenal', name: 'Arsenal', country: 'England' },
        { id: 'barcelona', name: 'FC Barcelona', country: 'Spain' },
        { id: 'bayern', name: 'FC Bayern München', country: 'Germany' },
        { id: 'flamengo', name: 'Flamengo', country: 'Brazil' },
        { id: 'juventus', name: 'Juventus', country: 'Italy' },
      ],
    };

    this.#logger.info('Returned soccer teams list', {
      teamCount: result.teams.length,
    });

    return result;
  }
}

export const soccerListServiceRef = createServiceRef<Expand<SoccerListService>>({
  id: 'soccer.list',
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: {
        logger: coreServices.logger,
      },
      async factory(deps) {
        return SoccerListService.create(deps);
      },
    }),
});
