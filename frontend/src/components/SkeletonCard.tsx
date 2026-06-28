import React from "react";

interface SkeletonCardProps {
  height?: string;
  className?: string;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  height = "h-32",
  className = "",
}) => (
  <div
    className={`${height} rounded-2xl border border-border bg-card animate-pulse ${className}`}
  />
);

/** A grid of skeleton cards that mimics the typical page layout */
export const SkeletonLayout: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div className="space-y-6">
    {/* Header skeleton */}
    <SkeletonCard height="h-20" />
    {/* Content rows */}
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SkeletonCard height="h-40" className="md:col-span-2" />
        <SkeletonCard height="h-40" />
      </div>
    ))}
  </div>
);
