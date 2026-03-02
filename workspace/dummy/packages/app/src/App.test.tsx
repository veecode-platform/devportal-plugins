import { render, waitFor } from '@testing-library/react';
import App from './App';

// Verify that the dummy plugin is correctly exported from its package
import {
  DummyPage,
  DummyCard,
  DummyContent,
  DummyIcon,
} from '@veecode-platform/backstage-plugin-dummy';

describe('App', () => {
  it('should render', async () => {
    process.env = {
      NODE_ENV: 'test',
      APP_CONFIG: [
        {
          data: {
            app: { title: 'Test' },
            backend: { baseUrl: 'http://localhost:7007' },
            techdocs: {
              storageUrl: 'http://localhost:7007/api/techdocs/static/docs',
            },
          },
          context: 'test',
        },
      ] as any,
    };

    const rendered = render(<App />);

    await waitFor(() => {
      expect(rendered.baseElement).toBeInTheDocument();
    });
  });
});

describe('Plugin wiring', () => {
  it('should export all dummy plugin components', () => {
    expect(DummyPage).toBeDefined();
    expect(DummyCard).toBeDefined();
    expect(DummyContent).toBeDefined();
    expect(DummyIcon).toBeDefined();
  });
});
