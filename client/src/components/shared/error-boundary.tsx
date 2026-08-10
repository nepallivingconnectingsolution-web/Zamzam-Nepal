import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Shown instead of the default card — used for whole-app vs per-route framing. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time exceptions.
 *
 * React unmounts the ENTIRE tree when a render throws and nothing catches it —
 * the screen goes blank or stops responding to every click, with no message
 * and nothing in the UI to act on. To a user that is indistinguishable from
 * "the page froze", and the underlying error is invisible unless the console
 * happens to be open.
 *
 * This keeps the failure local: the shell and its navigation survive, the
 * person can retry or move to another screen, and the actual error message is
 * put on screen instead of being swallowed.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the component stack — without it a minified production trace is
    // near-useless for working out which screen actually failed.
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="grid size-12 place-items-center rounded-full bg-error/10 text-error">
          <AlertTriangle className="size-6" />
        </div>
        <div>
          <h2 className="font-display text-h1 font-bold">This screen hit an error</h2>
          <p className="mt-1 text-body text-muted-fg">
            Nothing you entered was sent. Try again, or move to another screen.
          </p>
        </div>

        {/* The message itself, on screen. Previously the only trace of a crash
            was in devtools, so a report could only ever be "it froze". */}
        <pre className="max-w-full overflow-x-auto rounded-md bg-surface-2 px-3 py-2 text-left text-caption text-muted-fg">
          {error.message || String(error)}
        </pre>

        <Button variant="accent" onClick={this.reset}>
          <RefreshCw className="size-4" /> Try again
        </Button>
      </div>
    );
  }
}
