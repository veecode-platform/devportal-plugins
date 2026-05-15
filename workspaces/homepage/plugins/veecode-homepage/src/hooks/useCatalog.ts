import { Entity } from '@backstage/catalog-model';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import useAsync from 'react-use/esm/useAsync';

// type VisitItem = {
//   label: string;
//   value: number;
// };

// type VisitData = {
//   id: string;
//   name: string;
//   path: string;
//   hits: number;
// };
interface GetEntitiesResponse {
  items: Entity[];
}
interface UseCatalogType {
  resources: Entity[];
  apis: Entity[];
  components: Entity[];
}

export const useCatalog = () => {
  const useCatalogApi = useApi(catalogApiRef);

  const { value, loading, error } =
    useAsync(async (): Promise<UseCatalogType> => {
      const response =
        (await useCatalogApi.getEntities()) as GetEntitiesResponse;

      const resources = response.items.filter(
        item =>
          item.kind.toLocaleLowerCase() !== 'api' &&
          item.kind.toLocaleLowerCase() !== 'Component' &&
          item.kind.toLocaleLowerCase() !== 'group' &&
          item.kind.toLocaleLowerCase() !== 'user' &&
          item.kind.toLocaleLowerCase() !== 'location',
      );
      const apis = response.items.filter(
        item => item.kind.toLocaleLowerCase() === 'api',
      );
      const components = response.items.filter(
        item => item.kind.toLocaleLowerCase() === 'component',
      );

      return {
        resources,
        apis,
        components,
      };
    }, []);

  return {
    loading,
    error,
    resources: value?.resources ?? [],
    apis: value?.apis ?? [],
    components: value?.components ?? [],
  };
};
