import { describe, expect, it } from "vitest";

import { safeRelativePath } from "@/lib/security/redirect";

describe("safeRelativePath", () => {
  it("accepts ordinary same-origin paths", () => {
    expect(safeRelativePath("/home")).toBe("/home");
    expect(safeRelativePath("/my-community")).toBe("/my-community");
    expect(safeRelativePath("/communities/enugu-ezike")).toBe(
      "/communities/enugu-ezike",
    );
  });

  it("keeps query strings and fragments on a valid path", () => {
    expect(safeRelativePath("/explore?kind=village#list")).toBe(
      "/explore?kind=village#list",
    );
  });

  it("falls back when the value is missing", () => {
    expect(safeRelativePath(null)).toBe("/home");
    expect(safeRelativePath(undefined)).toBe("/home");
    expect(safeRelativePath("")).toBe("/home");
  });

  it("rejects absolute URLs to other origins", () => {
    expect(safeRelativePath("https://evil.example/steal")).toBe("/home");
    expect(safeRelativePath("http://evil.example")).toBe("/home");
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeRelativePath("//evil.example")).toBe("/home");
    expect(safeRelativePath("//evil.example/path")).toBe("/home");
  });

  it("rejects backslash tricks that some browsers normalise", () => {
    expect(safeRelativePath("/\\evil.example")).toBe("/home");
    expect(safeRelativePath("/path\\to")).toBe("/home");
  });

  it("rejects embedded control characters", () => {
    expect(safeRelativePath("/home\nSet-Cookie: x=1")).toBe("/home");
    expect(safeRelativePath("/ja\tvascript:alert(1)")).toBe("/home");
    expect(safeRelativePath(`/nul${String.fromCharCode(0)}`)).toBe("/home");
  });

  it("rejects scheme-like values that are not rooted", () => {
    expect(safeRelativePath("javascript:alert(1)")).toBe("/home");
    expect(safeRelativePath("data:text/html,<script>")).toBe("/home");
    expect(safeRelativePath("home")).toBe("/home");
  });

  it("honours a custom fallback", () => {
    expect(safeRelativePath("https://evil.example", "/login")).toBe("/login");
  });
});
