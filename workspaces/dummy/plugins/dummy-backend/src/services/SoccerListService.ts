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

export type PaginationOptions = {
  limit?: number;
  offset?: number;
};

export type SoccerTeamsResponse = {
  teams: SoccerTeam[];
  totalCount: number;
  limit: number;
  offset: number;
};

export class SoccerListService {
  readonly #logger: LoggerService;

  static create(options: { logger: LoggerService }) {
    return new SoccerListService(options.logger);
  }

  private constructor(logger: LoggerService) {
    this.#logger = logger;
  }

  async listTeams(options?: PaginationOptions): Promise<SoccerTeamsResponse> {
    const limit = options?.limit ?? 10;
    const offset = options?.offset ?? 0;

    const allTeams: SoccerTeam[] = [
        { id: 'arsenal', name: 'Arsenal', country: 'England' },
        { id: 'barcelona', name: 'FC Barcelona', country: 'Spain' },
        { id: 'bayern', name: 'FC Bayern München', country: 'Germany' },
        { id: 'flamengo', name: 'Flamengo', country: 'Brazil' },
        { id: 'juventus', name: 'Juventus', country: 'Italy' },
        { id: 'realmadrid', name: 'Real Madrid', country: 'Spain' },
        { id: 'manchester', name: 'Manchester United', country: 'England' },
        { id: 'liverpool', name: 'Liverpool', country: 'England' },
        { id: 'chelsea', name: 'Chelsea', country: 'England' },
        { id: 'mancity', name: 'Manchester City', country: 'England' },
        { id: 'psg', name: 'Paris Saint-Germain', country: 'France' },
        { id: 'lyon', name: 'Olympique Lyonnais', country: 'France' },
        { id: 'marseille', name: 'Olympique Marseille', country: 'France' },
        { id: 'inter', name: 'Inter Milan', country: 'Italy' },
        { id: 'milan', name: 'AC Milan', country: 'Italy' },
        { id: 'napoli', name: 'Napoli', country: 'Italy' },
        { id: 'dortmund', name: 'Borussia Dortmund', country: 'Germany' },
        { id: 'leipzig', name: 'RB Leipzig', country: 'Germany' },
        { id: 'atalanta', name: 'Atalanta', country: 'Italy' },
        { id: 'ajax', name: 'Ajax Amsterdam', country: 'Netherlands' },
        { id: 'portugal', name: 'FC Porto', country: 'Portugal' },
        { id: 'benfica', name: 'SL Benfica', country: 'Portugal' },
        { id: 'river', name: 'River Plate', country: 'Argentina' },
        { id: 'boca', name: 'Boca Juniors', country: 'Argentina' },
        { id: 'palmeiras', name: 'Palmeiras', country: 'Brazil' },
    ];

    const paginatedTeams = allTeams.slice(offset, offset + limit);

    this.#logger.info('Returned soccer teams list', {
      totalCount: allTeams.length,
      limit,
      offset,
      returnedCount: paginatedTeams.length,
    });

    return {
      teams: paginatedTeams,
      totalCount: allTeams.length,
      limit,
      offset,
    };
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
