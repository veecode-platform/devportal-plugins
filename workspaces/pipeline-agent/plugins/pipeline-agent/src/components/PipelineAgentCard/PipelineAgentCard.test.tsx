import { renderInTestApp } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import { PipelineAgentCard } from './PipelineAgentCard';

describe('PipelineAgentCard', () => {
  it('shows the card title', async () => {
    await renderInTestApp(<PipelineAgentCard />);

    expect(screen.getByText('Agente de pipeline')).toBeInTheDocument();
  });
});
