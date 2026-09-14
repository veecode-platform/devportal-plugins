import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PromotionReviewDialog } from './PromotionReviewDialog';

describe('PromotionReviewDialog', () => {
  it('shows the live config and the promotion mechanics explanation', () => {
    render(
      <PromotionReviewDialog
        open
        pluginName="rate-limiting"
        liveConfig={{ minute: 60, policy: 'local' }}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
      />,
    );

    expect(screen.getByText(/rate-limiting/)).toBeInTheDocument();
    expect(screen.getByText(/"minute": 60/)).toBeInTheDocument();
    expect(
      screen.getByText(/merge request in the service's repository/i),
    ).toBeInTheDocument();
  });

  it('calls onConfirm when the confirm action is clicked', async () => {
    const onConfirm = jest.fn();
    render(
      <PromotionReviewDialog
        open
        pluginName="rate-limiting"
        liveConfig={{ minute: 60 }}
        onClose={jest.fn()}
        onConfirm={onConfirm}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Promote to code/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('calls onClose when cancel is clicked', async () => {
    const onClose = jest.fn();
    render(
      <PromotionReviewDialog
        open
        pluginName="rate-limiting"
        liveConfig={{ minute: 60 }}
        onClose={onClose}
        onConfirm={jest.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('disables the confirm action while submitting', () => {
    render(
      <PromotionReviewDialog
        open
        pluginName="rate-limiting"
        liveConfig={{ minute: 60 }}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        submitting
      />,
    );

    expect(screen.getByRole('button', { name: /Promote to code/i })).toBeDisabled();
  });

  it('shows an error message when the promote attempt failed', () => {
    render(
      <PromotionReviewDialog
        open
        pluginName="rate-limiting"
        liveConfig={{ minute: 60 }}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        error="Plugin type 'jwt' has no promotion adapter and cannot be promoted to code"
      />,
    );

    expect(screen.getByText(/has no promotion adapter/)).toBeInTheDocument();
  });
});
