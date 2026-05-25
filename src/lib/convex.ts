export { api } from "../../convex/_generated/api";
export type { Doc, Id } from "../../convex/_generated/dataModel";

import type { Id, TableNames } from "../../convex/_generated/dataModel";
import type { SystemTableNames } from "convex/server";

type AllTableNames = TableNames | SystemTableNames;

export function asId<T extends AllTableNames>(value: string, _table: T): Id<T> {
  void _table;
  return value as Id<T>;
}
