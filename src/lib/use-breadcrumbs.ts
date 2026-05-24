"use client";

import { useQuery } from "convex/react";
import { api } from "@/lib/convex";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type BreadcrumbDef = {
  label: string;
  href?: string;
  dynamic?: boolean;
};

function getBreadcrumbDefs(pathname: string): BreadcrumbDef[] | null {
  if (pathname === "/projects/new") {
    return [
      { label: "Projects", href: "/projects" },
      { label: "New Project" },
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
  const dynamicDef = defs?.find((d) => d.dynamic);

  const project = useQuery(
    api.projects.queries.getProject,
    dynamicDef
      ? ({ project_id: dynamicDef.label as never } as never)
      : "skip",
  );

  if (!defs) return [];

  return defs.map((def) => {
    if (def.dynamic && project) {
      return { label: project.name, href: def.href };
    }
    if (def.dynamic) {
      return { label: "…", href: def.href };
    }
    return { label: def.label, href: def.href };
  });
}
