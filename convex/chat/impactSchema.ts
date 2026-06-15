import { z } from "zod";

export const bmadConflictSchema = z.object({
  type: z.enum(["adr", "convention", "prd", "duplicate"]),
  reference: z.string(),
  note: z.string(),
});

export const affectedEntitySchema = z.object({
  name: z.string(),
  reason: z.string(),
  confidence_score: z.number().min(0).max(1),
  bmad_conflicts: z.array(bmadConflictSchema).optional(),
});

export const impactAnalysisSchema = z.object({
  summary: z.string(),
  affected_modules: z.array(affectedEntitySchema),
  affected_apis: z.array(affectedEntitySchema),
  affected_data_models: z.array(affectedEntitySchema),
  affected_user_flows: z.array(affectedEntitySchema),
  hidden_dependencies: z.array(affectedEntitySchema),
});

export type BmadConflict = z.infer<typeof bmadConflictSchema>;
export type AffectedEntity = z.infer<typeof affectedEntitySchema>;
export type ImpactAnalysis = z.infer<typeof impactAnalysisSchema>;

export type BmadContext = {
  prd_sections: Array<{ key: string; content: string }>;
  adrs: Array<{ key: string; content: string }>;
  conventions: Array<{ key: string; content: string }>;
  domain_terms: Array<{ key: string; content: string }>;
};
