import { InfoCard } from '@backstage/core-components';
import { DummyFetchComponent } from '../DummyFetchComponent';

export const DummyCard = () => {
  return (
    <InfoCard title="Dummy Plugin">
      <DummyFetchComponent />
    </InfoCard>
  );
};
