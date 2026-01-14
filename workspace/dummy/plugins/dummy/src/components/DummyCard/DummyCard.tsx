import { InfoCard } from '@backstage/core-components';
import { ExampleFetchComponent } from '../ExampleFetchComponent';

export const DummyCard = () => {
  return (
    <InfoCard title="Dummy Plugin">
      <ExampleFetchComponent />
    </InfoCard>
  );
};
