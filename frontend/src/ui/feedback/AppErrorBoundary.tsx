// The one error boundary in the app (ADR-0185).
//
// There was none, and React's default for an uncaught render error is to unmount
// the entire tree — so every crash in this app's history has been a blank white
// screen with no error, no reload affordance and no way back. `lib/money.ts`
// already carried a comment saying exactly that about a currency-less trip; the
// build-swap freeze was the second instance of one bug.
//
// It mounts in `main.tsx`, above the router, because the surface it has to keep
// alive is the whole document — a crash inside `AppShell` would otherwise take
// the shell that would have framed the message.
//
// It offers a reload and nothing else deliberately: this catches errors we did
// not anticipate, so "try that again" is the only honest verb. `ErrorState` is
// the shared shell (ADR-0078) — the boundary supplies content, not a look.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from './ErrorState';
import { t } from '../../i18n/he';

export class AppErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The only record there is: no crash reporting is wired up (backlog), and a
    // blank screen with a silent console is what made the last one hard to place.
    console.error('Unhandled render error', error, info.componentStack);
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div className="fb-crash">
        <ErrorState
          size="pane"
          title={t.feedback.errorTitle}
          body={t.feedback.crash.body}
          onRetry={() => window.location.reload()}
          retryLabel={t.feedback.crash.action}
        />
      </div>
    );
  }
}
