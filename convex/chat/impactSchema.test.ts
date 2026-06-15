import { describe, expect, it } from "vitest";
import { impactAnalysisSchema } from "./impactSchema";

describe("impactAnalysisSchema", () => {
  it("accepts a complete well-formed impact analysis object", () => {
    const valid = {
      summary: "Add OAuth login affecting the auth module and users table.",
      affected_modules: [
        {
          name: "auth",
          reason: "New OAuth provider integration required",
          confidence_score: 0.92,
        },
      ],
      affected_apis: [
        {
          name: "POST /api/auth/login",
          reason: "Endpoint must accept OAuth tokens",
          confidence_score: 0.8,
          bmad_conflicts: [
            {
              type: "adr" as const,
              reference: "ADR-0003",
              note: "Conflicts with session-only auth decision",
            },
          ],
        },
      ],
      affected_data_models: [
        {
          name: "users",
          reason: "Add oauth_provider column",
          confidence_score: 0.75,
        },
      ],
      affected_user_flows: [
        {
          name: "Login flow",
          reason: "Add OAuth redirect step",
          confidence_score: 0.6,
        },
      ],
      hidden_dependencies: [
        {
          name: "rate-limiter",
          reason: "OAuth callback may spike request volume",
          confidence_score: 0.4,
        },
      ],
    };

    const result = impactAnalysisSchema.parse(valid);
    expect(result.summary).toBe(
      "Add OAuth login affecting the auth module and users table.",
    );
    expect(result.affected_modules).toHaveLength(1);
    expect(result.affected_modules[0].name).toBe("auth");
    expect(result.affected_apis[0].bmad_conflicts?.[0].reference).toBe(
      "ADR-0003",
    );
  });

  it("rejects confidence_score below 0", () => {
    const invalid = {
      summary: "x",
      affected_modules: [
        { name: "m", reason: "r", confidence_score: -0.1 },
      ],
      affected_apis: [],
      affected_data_models: [],
      affected_user_flows: [],
      hidden_dependencies: [],
    };
    expect(() => impactAnalysisSchema.parse(invalid)).toThrow();
  });

  it("rejects confidence_score above 1", () => {
    const invalid = {
      summary: "x",
      affected_modules: [
        { name: "m", reason: "r", confidence_score: 1.5 },
      ],
      affected_apis: [],
      affected_data_models: [],
      affected_user_flows: [],
      hidden_dependencies: [],
    };
    expect(() => impactAnalysisSchema.parse(invalid)).toThrow();
  });

  it("rejects missing summary", () => {
    const invalid = {
      affected_modules: [],
      affected_apis: [],
      affected_data_models: [],
      affected_user_flows: [],
      hidden_dependencies: [],
    };
    expect(() => impactAnalysisSchema.parse(invalid)).toThrow();
  });

  it("rejects missing affected_modules array", () => {
    const invalid = {
      summary: "x",
      affected_apis: [],
      affected_data_models: [],
      affected_user_flows: [],
      hidden_dependencies: [],
    };
    expect(() => impactAnalysisSchema.parse(invalid)).toThrow();
  });

  it("accepts empty arrays for all affected categories", () => {
    const valid = {
      summary: "Feature touches nothing identifiable.",
      affected_modules: [],
      affected_apis: [],
      affected_data_models: [],
      affected_user_flows: [],
      hidden_dependencies: [],
    };
    const result = impactAnalysisSchema.parse(valid);
    expect(result.affected_modules).toEqual([]);
    expect(result.affected_apis).toEqual([]);
    expect(result.hidden_dependencies).toEqual([]);
  });

  it("accepts entities without optional bmad_conflicts", () => {
    const valid = {
      summary: "x",
      affected_modules: [
        { name: "m", reason: "r", confidence_score: 0.5 },
      ],
      affected_apis: [],
      affected_data_models: [],
      affected_user_flows: [],
      hidden_dependencies: [],
    };
    const result = impactAnalysisSchema.parse(valid);
    expect(result.affected_modules[0].bmad_conflicts).toBeUndefined();
  });

  it("accepts empty bmad_conflicts array", () => {
    const valid = {
      summary: "x",
      affected_modules: [
        {
          name: "m",
          reason: "r",
          confidence_score: 0.5,
          bmad_conflicts: [],
        },
      ],
      affected_apis: [],
      affected_data_models: [],
      affected_user_flows: [],
      hidden_dependencies: [],
    };
    const result = impactAnalysisSchema.parse(valid);
    expect(result.affected_modules[0].bmad_conflicts).toEqual([]);
  });

  it("rejects invalid bmad_conflict type", () => {
    const invalid = {
      summary: "x",
      affected_modules: [
        {
          name: "m",
          reason: "r",
          confidence_score: 0.5,
          bmad_conflicts: [
            {
              type: "unknown",
              reference: "x",
              note: "y",
            },
          ],
        },
      ],
      affected_apis: [],
      affected_data_models: [],
      affected_user_flows: [],
      hidden_dependencies: [],
    };
    expect(() => impactAnalysisSchema.parse(invalid)).toThrow();
  });

  it("rejects entity missing required name", () => {
    const invalid = {
      summary: "x",
      affected_modules: [{ reason: "r", confidence_score: 0.5 }],
      affected_apis: [],
      affected_data_models: [],
      affected_user_flows: [],
      hidden_dependencies: [],
    };
    expect(() => impactAnalysisSchema.parse(invalid)).toThrow();
  });

  it("accepts all four valid bmad_conflict types", () => {
    for (const type of ["adr", "convention", "prd", "duplicate"] as const) {
      const valid = {
        summary: "x",
        affected_modules: [
          {
            name: "m",
            reason: "r",
            confidence_score: 0.5,
            bmad_conflicts: [{ type, reference: "ref", note: "n" }],
          },
        ],
        affected_apis: [],
        affected_data_models: [],
        affected_user_flows: [],
        hidden_dependencies: [],
      };
      const result = impactAnalysisSchema.parse(valid);
      expect(result.affected_modules[0].bmad_conflicts?.[0].type).toBe(type);
    }
  });

  it("accepts confidence_score at exact boundaries 0 and 1", () => {
    for (const score of [0, 1]) {
      const valid = {
        summary: "x",
        affected_modules: [
          { name: "m", reason: "r", confidence_score: score },
        ],
        affected_apis: [],
        affected_data_models: [],
        affected_user_flows: [],
        hidden_dependencies: [],
      };
      expect(() => impactAnalysisSchema.parse(valid)).not.toThrow();
    }
  });
});
