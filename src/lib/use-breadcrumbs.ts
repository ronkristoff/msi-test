"use client";

import { useQuery } from "convex/react";
import { api, asId } from "@/lib/convex";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type BreadcrumbDef = {
  label: string;
  href?: string;
  dynamic?: boolean;
  suiteId?: boolean;
};

function getBreadcrumbDefs(pathname: string): BreadcrumbDef[] | null {
  if (pathname === "/projects/new") {
    return [
      { label: "Projects", href: "/projects" },
      { label: "New Project" },
    ];
  }

  const runDetailMatch = pathname.match(/^\/runs\/([^/]+)$/);
  if (runDetailMatch) {
    return [
      { label: "Runs", href: "/runs" },
      { label: runDetailMatch[1] },
    ];
  }

  const settingsMatch = pathname.match(/^\/projects\/([^/]+)\/settings$/);
  if (settingsMatch) {
    const id = settingsMatch[1];
    return [
      { label: "Projects", href: "/projects" },
      { label: id, href: `/projects/${id}`, dynamic: true },
      { label: "Settings" },
    ];
  }

  const suiteMatch = pathname.match(/^\/projects\/([^/]+)\/suites\/([^/]+)$/);
  if (suiteMatch) {
    const [, projectId, suiteId] = suiteMatch;
    return [
      { label: "Projects", href: "/projects" },
      { label: projectId, href: `/projects/${projectId}`, dynamic: true },
      { label: suiteId, dynamic: true, suiteId: true },
    ];
  }

  const projectMatch = pathname.match(/^\/projects\/([^/]+)$/);
  if (projectMatch) {
    const id = projectMatch[1];
    return [
      { label: "Projects", href: "/projects" },
      { label: id, dynamic: true },
    ];
  }

  return null;
}

export function useBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const defs = getBreadcrumbDefs(pathname);
  const projectDef = defs?.find((d) => d.dynamic && !d.suiteId);
  const suiteDef = defs?.find((d) => d.suiteId);

  const project = useQuery(
    api.projects.queries.getProject,
    projectDef
      ? { project_id: asId(projectDef.label, "projects") }
      : "skip",
  );

  const suite = useQuery(
    api.suites.queries.getSuite,
    suiteDef
      ? { suite_id: asId(suiteDef.label, "suites") }
      : "skip",
  );

  if (!defs) return [];

  return defs.map((def) => {
    if (def.suiteId && suite) {
      return { label: suite.name, href: def.href };
    }
    if (def.suiteId) {
      return { label: "…", href: def.href };
    }
    if (def.dynamic && project) {
      return { label: project.name, href: def.href };
    }
    if (def.dynamic) {
      return { label: "…", href: def.href };
    }
    return { label: def.label, href: def.href };
  });
}
