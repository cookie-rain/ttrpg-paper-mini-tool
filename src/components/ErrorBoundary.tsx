import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearSavedProject } from '../store';

/**
 * Catches render errors so a project the app cannot display never leaves the user with a blank page.
 * The auto-saved project is restored on every start, so a damaged one would otherwise crash again
 * after every reload — hence the second button.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled error', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash">
        <h1>Something went wrong</h1>
        <p>
          The app could not display your project. Reloading usually helps. If it crashes again straight away, the
          automatically saved project is damaged — discard it to start over with an empty one.
        </p>
        <pre>{error.message}</pre>
        <div className="button-row">
          <button type="button" className="primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button
            type="button"
            onClick={async () => {
              await clearSavedProject();
              window.location.reload();
            }}
          >
            Discard saved project and reload
          </button>
        </div>
      </div>
    );
  }
}
