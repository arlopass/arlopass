"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type FallbackProps = {
  error: Error;
  resetErrorBoundary: () => void;
};

type Props = {
  fallback: (props: FallbackProps) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class BYOMErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
  }

  #resetErrorBoundary = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error !== null) {
      return this.props.fallback({
        error: this.state.error,
        resetErrorBoundary: this.#resetErrorBoundary,
      });
    }
    return this.props.children;
  }
}
