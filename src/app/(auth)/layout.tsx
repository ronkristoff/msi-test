"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { useRouter, usePathname } from "next/navigation";
import { api } from "@/lib/convex";
import { AppLayout } from "@/components/AppLayout";
import { useErrorLogger, setGlobalErrorLogger, initGlobalErrorHandlers } from "@/lib/error-logger";
import type { ReactNode } from "react";

const SIDEBARLESS_ROUTES = ["/onboarding"];

const PAGE_META: Record<string, { title: string; subtitle?: string }> = {
  "/dashboard": { title: "Dashboard", subtitle: "Test results and activity overview" },
  "/runs": { title: "Runs", subtitle: "All test execution history" },
  "/flakiness-map": { title: "Flakiness Map", subtitle: "Test stability heatmap across runs" },
  "/suites": { title: "Suites", subtitle: "Manage test suites" },
  "/insights": { title: "AI Insights", subtitle: "Aggregated AI analysis across runs" },
  "/settings": { title: "Settings", subtitle: "Manage your workspace, AI provider, and account" },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { logError } = useErrorLogger();
  const user = useQuery(api.workspaces.queries.getCurrentUser);
  const hasWorkspace = useQuery(api.workspaces.queries.hasWorkspace);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setGlobalErrorLogger(logError);
    initGlobalErrorHandlers();
  }, [logError]);

  useEffect(() => {
    if (user === undefined || hasWorkspace === undefined) return;

    if (!hasWorkspace && pathname !== "/onboarding") {
      router.push("/onboarding");
      return;
    }

    if (hasWorkspace && pathname === "/onboarding") {
      router.push("/dashboard");
      return;
    }
  }, [user, hasWorkspace, pathname, router]);

  if (user === undefined || hasWorkspace === undefined) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-[var(--muted)] text-sm">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-[var(--muted)] text-sm">Redirecting...</div>
      </div>
    );
  }

  if (!hasWorkspace && pathname !== "/onboarding") {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-[var(--muted)] text-sm">Redirecting...</div>
      </div>
    );
  }

  if (hasWorkspace && pathname === "/onboarding") {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-[var(--muted)] text-sm">Redirecting...</div>
      </div>
    );
  }

  if (SIDEBARLESS_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  const meta = PAGE_META[pathname];
  return (
    <AppLayout pageTitle={meta?.title} pageSubtitle={meta?.subtitle}>
      {children}
    </AppLayout>
  );
}
