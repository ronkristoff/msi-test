export { api } from "../../convex/_generated/api";
export type { Doc, Id } from "../../convex/_generated/dataModel";

import type { Id } from "../../convex/_generated/dataModel";

type TableNames = keyof import("../../convex/_generated/dataModel")["Id"];

export function asId<T extends TableNames>(value: string, _table: T): Id<T> {
  void _table;
  return value as Id<T>;
}
