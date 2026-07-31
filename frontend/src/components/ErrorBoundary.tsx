import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-[#060911] text-gray-100">
          <div className="backdrop-blur-2xl bg-white/[0.03] border border-red-500/30 p-8 rounded-3xl max-w-lg w-full text-center space-y-4 shadow-[0_16px_40px_0_rgba(0,0,0,0.6)]">
            <h1 className="text-2xl font-bold text-red-500">Something went wrong</h1>
            <p className="text-gray-400 text-sm">{this.state.error?.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-gradient-to-t from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 border border-blue-500 rounded-xl text-sm font-medium transition-colors shadow-md shadow-blue-800/60"
            >
              Reload application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
