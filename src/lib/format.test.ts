import { describe, expect, it } from "vitest";
import { formatBytes } from "./format";

describe("formatBytes", () => {
  it("returns '0 B' for null, undefined, or zero", () => {
    expect(formatBytes(null)).toBe("0 B");
    expect(formatBytes(undefined)).toBe("0 B");
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats bytes without decimal", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats kilobytes with one decimal", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(460800)).toBe("450.0 KB");
  });

  it("formats megabytes with one decimal", () => {
    expect(formatBytes(1258291)).toBe("1.2 MB");
    expect(formatBytes(1048576)).toBe("1.0 MB");
  });

  it("formats gigabytes with one decimal", () => {
    expect(formatBytes(1073741824)).toBe("1.0 GB");
  });

  it("formats terabytes without crashing (index clamp)", () => {
    expect(formatBytes(1099511627776)).toBe("1.0 TB");
    expect(formatBytes(1125899906842624)).toBe("1024.0 TB");
  });

  it("returns '0 B' for negative, NaN, or Infinity", () => {
    expect(formatBytes(-1024)).toBe("0 B");
    expect(formatBytes(NaN)).toBe("0 B");
    expect(formatBytes(Infinity)).toBe("0 B");
  });
});
