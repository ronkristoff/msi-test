"use client";

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-[var(--border-soft)] rounded-[var(--radius-sm)] ${className}`}
    />
  );
}

export function RunDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="p-4 border border-[var(--border)] rounded-[var(--radius-md)]">
        <Skeleton className="h-5 w-48 mb-2" />
        <div className="flex gap-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-12" />
        </div>
      </div>
      <div className="flex gap-4">
        <div className="w-[320px] shrink-0 flex flex-col border border-[var(--border)] rounded-[var(--radius-md)]">
          <div className="px-4 pt-3 pb-2 border-b border-[var(--border)]">
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="p-2 flex flex-col gap-1">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="max-w-[720px] flex flex-col gap-4">
      <div className="p-5 border border-[var(--border)] rounded-[var(--radius-md)]">
        <Skeleton className="h-6 w-48 mb-4" />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Skeleton className="h-3 w-16 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div>
            <Skeleton className="h-3 w-12 mb-2" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </div>
      <div className="p-5 border border-[var(--border)] rounded-[var(--radius-md)]">
        <Skeleton className="h-5 w-24 mb-4" />
        {[1, 2].map((i) => (
          <div key={i} className="py-3 border-b border-[var(--border-soft)]">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
