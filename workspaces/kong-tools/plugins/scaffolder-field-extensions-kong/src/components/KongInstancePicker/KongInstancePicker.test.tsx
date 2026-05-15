import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { TestApiProvider } from '@backstage/test-utils';
import KongInstancePicker from './KongInstancePicker';

const mockInstances = [
  { id: 'default', apiBaseUrl: 'http://kong:8001' },
  { id: 'staging', apiBaseUrl: 'http://kong-staging:8001', workspace: 'dev' },
];

function createMockApis(response: Response) {
  return [
    [
      discoveryApiRef,
      { getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/kong-service-manager-backend') },
    ] as const,
    [
      fetchApiRef,
      { fetch: jest.fn().mockResolvedValue(response) },
    ] as const,
  ];
}

const defaultProps = {
  onChange: jest.fn(),
  rawErrors: [],
  required: false,
  formData: undefined as string | undefined,
  schema: { title: 'Kong Instance', description: 'Pick an instance' },
  uiSchema: {},
  formContext: {} as any,
  name: 'kongInstance',
  idSchema: { $id: 'kongInstance' } as any,
  registry: {} as any,
  disabled: false,
  readonly: false,
  autofocus: false,
  errorSchema: {} as any,
  onBlur: jest.fn(),
  onFocus: jest.fn(),
};

function renderPicker(
  apis: readonly (readonly [any, any])[],
  overrides: Partial<typeof defaultProps> = {},
) {
  return render(
    <TestApiProvider apis={apis}>
      <KongInstancePicker {...defaultProps} {...overrides} />
    </TestApiProvider>,
  );
}

describe('KongInstancePicker', () => {
  it('renders loading state initially', () => {
    const neverResolve = new Promise<Response>(() => {});
    const apis = [
      [
        discoveryApiRef,
        { getBaseUrl: jest.fn().mockResolvedValue('http://localhost') },
      ] as const,
      [
        fetchApiRef,
        { fetch: jest.fn().mockReturnValue(neverResolve) },
      ] as const,
    ];

    renderPicker(apis);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders dropdown with instances after fetch', async () => {
    const response = new Response(JSON.stringify(mockInstances), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const apis = createMockApis(response);

    renderPicker(apis);

    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    const input = screen.getByRole('combobox');
    await userEvent.click(input);

    expect(screen.getByText('default')).toBeInTheDocument();
    expect(screen.getByText('staging')).toBeInTheDocument();
  });

  it('calls onChange with instance ID on selection', async () => {
    const onChange = jest.fn();
    const response = new Response(JSON.stringify(mockInstances), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const apis = createMockApis(response);

    renderPicker(apis, { onChange });

    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    const input = screen.getByRole('combobox');
    await userEvent.click(input);
    await userEvent.click(screen.getByText('default'));

    expect(onChange).toHaveBeenCalledWith('default');
  });

  it('renders error message when fetch fails', async () => {
    const response = new Response('', { status: 500 });
    const apis = createMockApis(response);

    renderPicker(apis);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load Kong instances/)).toBeInTheDocument();
    });
  });
});
