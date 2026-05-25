"use client";

import type { ReactNode } from "react";

type QueryResultProps<T> = {
  data: T | undefined | null;
  notFound: ReactNode;
  loading?: ReactNode;
  children: (data: NonNullable<T>) => ReactNode;
};

export function QueryResult<T>({ data, notFound, loading, children }: QueryResultProps<T>) {
  if (data === undefined) {
    return <>{loading ?? <div className="text-[var(--muted)] text-sm">Loading...</div>}</>;
  }
  if (data === null) {
    return <>{notFound}</>;
  }
  return <>{children(data)}</>;
}
