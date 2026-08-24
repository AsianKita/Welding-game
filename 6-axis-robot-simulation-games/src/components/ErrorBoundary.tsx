import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RotateCcw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center p-6 bg-[#0a0a0f] text-white select-none">
          <div className="max-w-md w-full bg-slate-900/90 border border-red-500/40 rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center space-y-4">
            <div className="p-3 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">
              <AlertTriangle size={28} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 mb-1 font-mono">
                {this.props.fallbackTitle || 'Workspace Restored'}
              </h2>
              <p className="text-xs text-slate-400">
                A graphics or simulation state reset occurred. Click below to continue seamlessly.
              </p>
            </div>
            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs shadow-lg transition-all cursor-pointer"
            >
              <RotateCcw size={14} />
              <span>Resume Simulation</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
