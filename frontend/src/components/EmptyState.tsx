import React from "react";
import { WifiOff } from "lucide-react";

interface EmptyStateProps {
  message?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  message = "Backend offline — start the FastAPI server to see live data."
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-card/60 backdrop-blur-md rounded-3xl border border-border/80 shadow-lg space-y-4 max-w-xl mx-auto my-12 transition-all duration-300">
      <div className="p-4 bg-destructive/10 dark:bg-rose-500/10 rounded-full border border-destructive/20 dark:border-rose-500/20 text-destructive dark:text-rose-400">
        <WifiOff className="w-10 h-10 animate-pulse" />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-bold tracking-tight">Connection Offline</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {message}
        </p>
      </div>
    </div>
  );
};
