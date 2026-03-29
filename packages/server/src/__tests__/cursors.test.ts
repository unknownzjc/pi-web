import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor } from "../utils/cursors.js";

describe("cursors", () => {
  it("round-trips stably", () => {
    const fields = { updatedAt: "2025-01-01T00:00:00Z", sessionId: "abc123" };
    const encoded = encodeCursor(fields);
    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual(fields);
  });

  it("produces different strings for different fields", () => {
    const a = encodeCursor({ updatedAt: "2025-01-01" });
    const b = encodeCursor({ updatedAt: "2025-01-02" });
    expect(a).not.toBe(b);
  });

  it("handles empty fields", () => {
    const fields = {};
    const encoded = encodeCursor(fields);
    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual({});
  });

  it("produces base64url-safe output (no +/ or =)", () => {
    const encoded = encodeCursor({ foo: "bar/baz+qux==?" });
    expect(encoded).not.toMatch(/[+/=]/);
  });
});
