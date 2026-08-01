import React from 'react';

interface LoadingFallbackProps {
  message?: string;
}

export function LoadingFallback({ message = 'Loading AstraWatch...' }: LoadingFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] h-full w-full bg-black/40 text-gray-100 p-8">
      <div className="relative flex items-center justify-center mb-6">
        <div className="w-16 h-16 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full bg-blue-500/20 backdrop-blur-sm animate-pulse flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
          </div>
        </div>
      </div>
      <p className="text-sm font-medium text-gray-400 tracking-wide animate-pulse">{message}</p>
    </div>
  );
}

export default LoadingFallback;
