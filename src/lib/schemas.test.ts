import { describe, expect, it } from "vitest";
import { testDataSchema, testDataEntrySchema } from "./schemas";

describe("testDataSchema", () => {
  it("accepts valid key-value pairs", () => {
    const result = testDataSchema.safeParse([
      { key: "employee_name", value: "John Doe" },
      { key: "salary", value: "75000" },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts empty array", () => {
    const result = testDataSchema.safeParse([]);
    expect(result.success).toBe(true);
  });

  it("rejects empty key", () => {
    const result = testDataSchema.safeParse([{ key: "", value: "test" }]);
    expect(result.success).toBe(false);
  });

  it("rejects empty value", () => {
    const result = testDataSchema.safeParse([{ key: "test", value: "" }]);
    expect(result.success).toBe(false);
  });

  it("rejects duplicate keys", () => {
    const result = testDataSchema.safeParse([
      { key: "name", value: "Alice" },
      { key: "name", value: "Bob" },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("Duplicate"))).toBe(true);
    }
  });

  it("rejects more than 50 entries", () => {
    const entries = Array.from({ length: 51 }, (_, i) => ({
      key: `key${i}`,
      value: `value${i}`,
    }));
    const result = testDataSchema.safeParse(entries);
    expect(result.success).toBe(false);
  });
});

describe("testDataEntrySchema", () => {
  it("rejects key over 100 characters", () => {
    const result = testDataEntrySchema.safeParse({
      key: "a".repeat(101),
      value: "test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects value over 1000 characters", () => {
    const result = testDataEntrySchema.safeParse({
      key: "test",
      value: "a".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts max length key and value", () => {
    const result = testDataEntrySchema.safeParse({
      key: "a".repeat(100),
      value: "a".repeat(1000),
    });
    expect(result.success).toBe(true);
  });
});
