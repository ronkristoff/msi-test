import type { FunctionReturnType } from "convex/server";
import { api } from "@/lib/convex";

export type DashboardStats = FunctionReturnType<typeof api.dashboard.queries.getDashboardStats>;
export type ActiveRun = FunctionReturnType<typeof api.dashboard.queries.getActiveRuns>[number];
