import { Component, ErrorInfo, ReactNode } from 'react';
import Alert from '@mui/lab/Alert';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  private unhandledRejectionHandler: (event: PromiseRejectionEvent) => void;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
    
    this.unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      // eslint-disable-next-line no-console
      console.error('Unhandled Promise Rejection:', event.reason);
      this.setState({ hasError: true });
    };
  }

  componentDidMount() {
    window.addEventListener('unhandledrejection', this.unhandledRejectionHandler);
  }

  componentWillUnmount() {
    window.removeEventListener('unhandledrejection', this.unhandledRejectionHandler);
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert severity="error">
          Something went wrong. Please make sure that you installed:
          <strong>
            <a
              href="https://github.com/veecode-platform/platform-backstage-plugins/plugins/github-workflows"
              target="_blank"
              rel="noopener noreferrer"
            >
              @veecode/github-workflows
            </a>
          </strong>
        </Alert>
      );
    }

    return <>{this.props.children}</>;
  }
}

export default ErrorBoundary;