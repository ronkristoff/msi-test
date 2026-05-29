import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";

type RunDetail = NonNullable<FunctionReturnType<typeof api.runs.queries.getRunDetail>>;

export type RunResultItem = RunDetail["results"][number];
export type StepItem = RunResultItem["steps"][number];
export type RunEnvironment = RunDetail["environment"];
