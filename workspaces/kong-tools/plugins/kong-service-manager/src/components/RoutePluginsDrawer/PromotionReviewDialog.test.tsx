import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PromotionReviewDialog } from './PromotionReviewDialog';

const mockPreviewPromotion = jest.fn();

jest.mock('../../context/KongServiceManagerContext', () => ({
  useKongServiceManager: () => ({
    previewPromotion: mockPreviewPromotion,
  }),
}));

const defaultProps = {
  pluginName: 'rate-limiting',
  liveConfig: { minute: 60, policy: 'local' },
  routeId: 'route-1',
  pluginId: 'plugin-1',
  entityRef: 'component:default/my-service',
  onClose: jest.fn(),
  onConfirm: jest.fn(),
};

describe('PromotionReviewDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreviewPromotion.mockResolvedValue({
      files: [{ path: 'chart/values.yaml', content: 'kong:\n  rateLimit:\n    minute: 60\n' }],
      normalizedConfig: { minute: 60 },
    });
  });

  it('shows the live config and the promotion mechanics explanation', async () => {
    render(<PromotionReviewDialog open {...defaultProps} />);

    expect(screen.getByText(/rate-limiting/)).toBeInTheDocument();
    expect(screen.getByText(/"minute": 60/)).toBeInTheDocument();
    expect(
      screen.getByText(/merge request in the service's repository/i),
    ).toBeInTheDocument();

    // let the preview promise settle so it doesn't resolve after the test tears down
    await waitFor(() => expect(screen.getByText(/chart\/values\.yaml/)).toBeInTheDocument());
  });

  it('fetches and shows the generated chart file once the preview resolves', async () => {
    render(<PromotionReviewDialog open {...defaultProps} />);

    expect(mockPreviewPromotion).toHaveBeenCalledWith(
      'route-1',
      'plugin-1',
      'component:default/my-service',
    );
    await waitFor(() =>
      expect(screen.getByText(/chart\/values\.yaml/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/rateLimit/)).toBeInTheDocument();
  });

  it('disables confirm and shows the error when the preview fails', async () => {
    mockPreviewPromotion.mockRejectedValue(
      new Error("Plugin type 'jwt' has no promotion adapter and cannot be promoted to code"),
    );
    render(<PromotionReviewDialog open {...defaultProps} />);

    await waitFor(() =>
      expect(screen.getByText(/has no promotion adapter/)).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /Promote to code/i })).toBeDisabled();
  });

  it('does not fetch a preview when there is no route or plugin id yet', () => {
    render(<PromotionReviewDialog open {...defaultProps} routeId={null} pluginId={null} />);
    expect(mockPreviewPromotion).not.toHaveBeenCalled();
  });

  it('calls onConfirm when the confirm action is clicked', async () => {
    const onConfirm = jest.fn();
    render(<PromotionReviewDialog open {...defaultProps} onConfirm={onConfirm} />);

    await waitFor(() => expect(screen.getByText(/chart\/values\.yaml/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /Promote to code/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('calls onClose when cancel is clicked', async () => {
    const onClose = jest.fn();
    render(<PromotionReviewDialog open {...defaultProps} onClose={onClose} />);

    await waitFor(() => expect(screen.getByText(/chart\/values\.yaml/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('disables the confirm action while submitting', async () => {
    render(<PromotionReviewDialog open {...defaultProps} submitting />);

    await waitFor(() => expect(screen.getByText(/chart\/values\.yaml/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Promote to code/i })).toBeDisabled();
  });

  it('shows an error message when the promote attempt (not the preview) failed', async () => {
    render(
      <PromotionReviewDialog
        open
        {...defaultProps}
        error="Plugin type 'jwt' has no promotion adapter and cannot be promoted to code"
      />,
    );

    expect(screen.getByText(/has no promotion adapter/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/chart\/values\.yaml/)).toBeInTheDocument());
  });
});
