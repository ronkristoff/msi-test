import { describe, expect, it } from "vitest";
import {
  computeModuleFingerprint,
  diffModuleSnapshots,
  type ModuleFingerprint,
  type ModuleFingerprintInput,
} from "./moduleDiff";

describe("computeModuleFingerprint: determinism", () => {
  it("returns identical output for identical input", () => {
    const input: ModuleFingerprintInput = {
      name: "Auth Module",
      description: "Handles authentication",
      files: ["src/auth.ts"],
      apis: [{ path: "/api/login", method: "POST" }],
      user_flows: [{ route: "/login", name: "Login" }],
      dependencies: ["crypto"],
    };
    const fp1 = computeModuleFingerprint(input);
    const fp2 = computeModuleFingerprint({ ...input });
    expect(fp1).toBe(fp2);
  });
});

describe("computeModuleFingerprint: field sensitivity", () => {
  const base: ModuleFingerprintInput = {
    name: "Auth Module",
    description: "Handles authentication",
    files: ["src/auth.ts"],
    apis: [{ path: "/api/login", method: "POST" }],
    user_flows: [{ route: "/login", name: "Login" }],
    dependencies: ["crypto"],
  };

  it("changes when name differs", () => {
    expect(computeModuleFingerprint({ ...base, name: "Other" })).not.toBe(
      computeModuleFingerprint(base),
    );
  });

  it("changes when description differs", () => {
    expect(
      computeModuleFingerprint({ ...base, description: "Other description" }),
    ).not.toBe(computeModuleFingerprint(base));
  });

  it("changes when files differ", () => {
    expect(computeModuleFingerprint({ ...base, files: ["src/other.ts"] })).not.toBe(
      computeModuleFingerprint(base),
    );
  });

  it("changes when apis differ", () => {
    expect(
      computeModuleFingerprint({ ...base, apis: [{ path: "/api/logout", method: "POST" }] }),
    ).not.toBe(computeModuleFingerprint(base));
  });

  it("changes when data_models differ", () => {
    expect(
      computeModuleFingerprint({ ...base, data_models: [{ name: "User", fields: ["id"] }] }),
    ).not.toBe(computeModuleFingerprint(base));
  });

  it("changes when user_flows differ", () => {
    expect(
      computeModuleFingerprint({ ...base, user_flows: [{ route: "/logout", name: "Logout" }] }),
    ).not.toBe(computeModuleFingerprint(base));
  });

  it("changes when dependencies differ", () => {
    expect(computeModuleFingerprint({ ...base, dependencies: ["fs"] })).not.toBe(
      computeModuleFingerprint(base),
    );
  });
});

describe("computeModuleFingerprint: defensiveness on unknown shapes", () => {
  it("does not throw when apis is a weird object", () => {
    expect(() =>
      computeModuleFingerprint({ name: "M", apis: { weird: "shape" } as unknown }),
    ).not.toThrow();
  });

  it("does not throw when apis is null", () => {
    expect(() => computeModuleFingerprint({ name: "M", apis: null })).not.toThrow();
  });

  it("does not throw when apis is undefined", () => {
    expect(() => computeModuleFingerprint({ name: "M", apis: undefined })).not.toThrow();
  });

  it("does not throw when user_flows is an arbitrary array", () => {
    expect(() =>
      computeModuleFingerprint({ name: "M", user_flows: [{ route: "/x" }] as unknown }),
    ).not.toThrow();
  });

  it("returns a non-empty string in all defensive cases", () => {
    const cases: ModuleFingerprintInput[] = [
      { name: "M", apis: { weird: "shape" } as unknown },
      { name: "M", apis: null },
      { name: "M", apis: undefined },
      { name: "M", user_flows: [{ route: "/x" }] as unknown },
    ];
    for (const c of cases) {
      const fp = computeModuleFingerprint(c);
      expect(typeof fp).toBe("string");
      expect(fp.length).toBeGreaterThan(0);
    }
  });
});

describe("computeModuleFingerprint: hex output format", () => {
  it("matches /^[0-9a-f]+$/ for a populated module", () => {
    const fp = computeModuleFingerprint({
      name: "Auth Module",
      description: "Handles auth",
      files: ["a.ts"],
      apis: [{ path: "/x" }],
      user_flows: [{ route: "/y" }],
      dependencies: ["d"],
    });
    expect(fp).toMatch(/^[0-9a-f]+$/);
  });
});

describe("diffModuleSnapshots: identical inputs", () => {
  it("returns all-empty arrays when prev and next are identical", () => {
    const a: ModuleFingerprint = { name: "M", fingerprint: "abc" };
    const diff = diffModuleSnapshots([a], [{ ...a }]);
    expect(diff).toEqual({ added: [], removed: [], changed: [] });
  });
});

describe("diffModuleSnapshots: added", () => {
  it("returns added: ['NewMod'] when next has a module not in prev", () => {
    const diff = diffModuleSnapshots(
      [{ name: "A", fingerprint: "1" }],
      [
        { name: "A", fingerprint: "1" },
        { name: "NewMod", fingerprint: "2" },
      ],
    );
    expect(diff.added).toEqual(["NewMod"]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });
});

describe("diffModuleSnapshots: removed", () => {
  it("returns removed: ['OldMod'] when prev has a module not in next", () => {
    const diff = diffModuleSnapshots(
      [
        { name: "A", fingerprint: "1" },
        { name: "OldMod", fingerprint: "2" },
      ],
      [{ name: "A", fingerprint: "1" }],
    );
    expect(diff.removed).toEqual(["OldMod"]);
    expect(diff.added).toEqual([]);
    expect(diff.changed).toEqual([]);
  });
});

describe("diffModuleSnapshots: changed", () => {
  it("returns changed: ['Mod'] when both have Mod but fingerprints differ", () => {
    const diff = diffModuleSnapshots(
      [{ name: "Mod", fingerprint: "1" }],
      [{ name: "Mod", fingerprint: "2" }],
    );
    expect(diff.changed).toEqual(["Mod"]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });
});

describe("diffModuleSnapshots: empty inputs", () => {
  it("returns all-empty when prev=[] and next=[]", () => {
    const diff = diffModuleSnapshots([], []);
    expect(diff).toEqual({ added: [], removed: [], changed: [] });
  });

  it("returns added: [a,b] when prev=[] and next=[a,b]", () => {
    const diff = diffModuleSnapshots([], [
      { name: "A", fingerprint: "1" },
      { name: "B", fingerprint: "2" },
    ]);
    expect(diff.added).toEqual(["A", "B"]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it("returns removed: [a,b] when prev=[a,b] and next=[]", () => {
    const diff = diffModuleSnapshots(
      [
        { name: "A", fingerprint: "1" },
        { name: "B", fingerprint: "2" },
      ],
      [],
    );
    expect(diff.removed).toEqual(["A", "B"]);
    expect(diff.added).toEqual([]);
    expect(diff.changed).toEqual([]);
  });
});

describe("diffModuleSnapshots: immutability", () => {
  it("does NOT mutate the prev or next arrays", () => {
    const prev: ModuleFingerprint[] = [
      { name: "A", fingerprint: "1" },
      { name: "B", fingerprint: "2" },
    ];
    const next: ModuleFingerprint[] = [
      { name: "A", fingerprint: "3" },
      { name: "C", fingerprint: "4" },
    ];
    const prevSnapshot = prev.map((e) => ({ ...e }));
    const nextSnapshot = next.map((e) => ({ ...e }));

    diffModuleSnapshots(prev, next);

    expect(prev).toEqual(prevSnapshot);
    expect(next).toEqual(nextSnapshot);
  });
});

describe("diffModuleSnapshots: duplicate-name defensive case", () => {
  it("does not throw and yields a deterministic result when prev has duplicate names", () => {
    const prev: ModuleFingerprint[] = [
      { name: "Dup", fingerprint: "1" },
      { name: "Dup", fingerprint: "2" },
    ];
    const next: ModuleFingerprint[] = [{ name: "Dup", fingerprint: "2" }];

    expect(() => diffModuleSnapshots(prev, next)).not.toThrow();

    const diff = diffModuleSnapshots(prev, next);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });
});

describe("diffModuleSnapshots: case-insensitive + whitespace-trimmed identity", () => {
  it("treats a casing-only rename (same fingerprint) as unchanged — NOT removed+added", () => {
    const prev: ModuleFingerprint[] = [{ name: "Auth Module", fingerprint: "1" }];
    const next: ModuleFingerprint[] = [{ name: "auth module", fingerprint: "1" }];

    const diff = diffModuleSnapshots(prev, next);
    expect(diff.changed).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it("treats a casing-only rename (different fingerprint) as 'changed', preserving the next name", () => {
    const prev: ModuleFingerprint[] = [{ name: "Auth Module", fingerprint: "1" }];
    const next: ModuleFingerprint[] = [{ name: "auth module", fingerprint: "2" }];

    const diff = diffModuleSnapshots(prev, next);
    expect(diff.changed).toEqual(["auth module"]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it("treats a whitespace-only difference as the same module", () => {
    const prev: ModuleFingerprint[] = [{ name: "  Auth  ", fingerprint: "1" }];
    const next: ModuleFingerprint[] = [{ name: "Auth", fingerprint: "1" }];

    const diff = diffModuleSnapshots(prev, next);
    expect(diff.changed).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });
});
