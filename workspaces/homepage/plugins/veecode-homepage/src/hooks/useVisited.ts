import { useApi } from '@backstage/core-plugin-api';
import { Visit, visitsApiRef } from '@backstage/plugin-home';
import useAsync from 'react-use/esm/useAsync';

type VisitItem = {
  label: string;
  value: number;
};

type VisitData = {
  id: string;
  name: string;
  path: string;
  hits: number;
};

interface VisitType {
  total: number;
  items: VisitItem[];
  visits: VisitData[];
}

export const useVisited = () => {
  const useVisitedApi = useApi(visitsApiRef);

  const { value, loading, error } = useAsync(async (): Promise<VisitType> => {
    const data = (await useVisitedApi.list()) as Visit[];
    const total = data.reduce((acc, item) => acc + item.hits, 0);
    const items = data.map(visit => ({
      label: visit.name,
      value: visit.hits,
    }));
    const visits = data.map(visit => ({
      id: visit.id,
      name: visit.name,
      path: visit.pathname,
      hits: visit.hits,
    }));
    return {
      total,
      items,
      visits,
    };
  }, []);

  return {
    loading,
    error,
    total: value?.total ?? 0,
    items: value?.items ?? [],
    visits: value?.visits ?? [],
  };
};
