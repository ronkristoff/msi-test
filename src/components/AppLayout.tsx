"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex";
import { authClient } from "@/lib/auth-client";
import { Topbar } from "@/components/ui/Topbar";
import type { ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  count?: number | string;
  countVariant?: "default" | "danger";
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        ),
      },
      {
        href: "/runs",
        label: "Runs",
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        ),
      },
      {
        href: "/flakiness-map",
        label: "Flakiness Map",
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Testing",
    items: [
      {
        href: "/suites",
        label: "Suites",
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        ),
      },
      {
        href: "/insights",
        label: "AI Insights",
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        href: "/settings",
        label: "Settings",
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        ),
      },
    ],
  },
];

type AppLayoutProps = {
  children: ReactNode;
  pageTitle?: string;
  pageSubtitle?: string;
  pageActions?: ReactNode;
};

export function AppLayout({ children, pageTitle, pageSubtitle, pageActions }: AppLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useQuery(api.workspaces.queries.getCurrentUser);
  const workspace = useQuery(api.workspaces.queries.getWorkspaceForUser);

  return (
    <div className="grid grid-cols-[240px_1fr] min-h-screen max-[900px]:grid-cols-1 max-[900px]:[.sidebar]:hidden">
      <aside className="sidebar bg-[var(--accent)] text-[var(--accent-on)] p-4 sticky top-0 h-screen overflow-y-auto">
        <div className="font-[var(--font-display)] text-lg font-bold tracking-tight px-2 py-2 pb-6 border-b border-white/15 mb-4">
          MSITest
        </div>
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-6">
            <div className="font-[var(--font-mono)] text-[11px] tracking-[0.08em] uppercase text-white/50 mb-2 px-2">
              {section.label}
            </div>
            {section.items.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-2 py-2 rounded-[var(--radius-sm)] text-sm transition-colors duration-[var(--motion-fast)] ${
                    isActive
                      ? "bg-[rgba(27,97,201,0.25)] text-white"
                      : "text-white/75 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  {item.count !== undefined && (
                    <span className={`font-[var(--font-mono)] text-[11px] px-1.5 py-0.5 rounded-lg ${
                      item.countVariant === "danger"
                        ? "bg-[var(--danger)] text-white"
                        : "bg-white/15 text-white/70"
                    }`}>
                      {item.count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
        <div className="absolute bottom-4 left-4 right-4">
          {user && (
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="w-8 h-8 rounded-full bg-white/20 grid place-items-center text-sm font-bold">
                {user.name?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{user.name}</div>
                <div className="font-[var(--font-mono)] text-[11px] text-white/60 truncate">{user.email}</div>
              </div>
            </div>
          )}
          <button
            onClick={async () => {
              await authClient.signOut();
              router.push("/login");
            }}
            className="w-full text-left flex items-center gap-2 px-2 py-2 text-sm text-white/60 hover:text-white hover:bg-white/10 rounded-[var(--radius-sm)] transition-colors duration-[var(--motion-fast)] mt-1 active:translate-y-px"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign out
          </button>
        </div>
      </aside>

      <div className="main-content flex flex-col min-h-screen">
        <Topbar
          title={pageTitle ?? workspace?.name ?? "MSITest"}
          subtitle={pageSubtitle}
          actions={pageActions}
        />
        <div className="flex-1 p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
