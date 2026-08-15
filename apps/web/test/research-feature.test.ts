import { describe, expect, it } from "vitest";
import {
  parseTripAllowlist,
  researchCaptureUrl,
  researchEnabledForTrip,
} from "../src/lib/research-feature";

describe("Research rollout and capture helpers", () => {
  it("is off unless both the flag and trip allowlist enable it", () => {
    expect(researchEnabledForTrip("trip-a", "false", "trip-a")).toBe(false);
    expect(researchEnabledForTrip("trip-a", "true", "trip-b")).toBe(false);
    expect(researchEnabledForTrip("trip-a", "true", " trip-b, trip-a ")).toBe(true);
    expect(researchEnabledForTrip("trip-a", "true", "*")).toBe(true);
    expect(parseTripAllowlist(" trip-a,trip-b,trip-a ")).toEqual(new Set(["trip-a", "trip-b"]));
  });

  it("treats only a complete HTTP(S) value as a source URL", () => {
    expect(researchCaptureUrl(" https://example.com/path ")).toBe("https://example.com/path");
    expect(researchCaptureUrl("http://example.com")).toBe("http://example.com/");
    expect(researchCaptureUrl("example.com")).toBeNull();
    expect(researchCaptureUrl("Read https://example.com later")).toBeNull();
    expect(researchCaptureUrl("javascript:alert(1)")).toBeNull();
  });
});
