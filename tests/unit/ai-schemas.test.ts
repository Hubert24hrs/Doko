import { describe, it, expect } from "vitest";
import { aiQuerySchema } from "@/features/ai/schemas";
import { queryCulturalKnowledge, IGBO_EZE_NORTH_KNOWLEDGE } from "@/features/ai/knowledge";

describe("Oba AI Schemas & Grounded Knowledge", () => {
  it("validates a standard user question", () => {
    const res = aiQuerySchema.safeParse({
      prompt: "Tell me about the Omabe masquerade festival",
      village_context: "Ogrute",
    });

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.prompt).toBe("Tell me about the Omabe masquerade festival");
      expect(res.data.village_context).toBe("Ogrute");
    }
  });

  it("rejects questions that are too short", () => {
    const res = aiQuerySchema.safeParse({
      prompt: "a",
    });
    expect(res.success).toBe(false);
  });

  it("rejects questions exceeding 500 characters", () => {
    const longPrompt = "a".repeat(501);
    const res = aiQuerySchema.safeParse({
      prompt: longPrompt,
    });
    expect(res.success).toBe(false);
  });

  it("retrieves Omabe festival knowledge when queried", () => {
    const articles = queryCulturalKnowledge("omabe festival");
    expect(articles.length).toBeGreaterThan(0);
    expect(articles.some((a) => a.toLowerCase().includes("omabe"))).toBe(true);
  });

  it("retrieves market day schedule when queried", () => {
    const articles = queryCulturalKnowledge("traditional market days eke oye afor nkwo");
    expect(articles.length).toBeGreaterThan(0);
    expect(articles.some((a) => a.toLowerCase().includes("eke"))).toBe(true);
  });

  it("contains complete set of core cultural topics in knowledge base", () => {
    expect(IGBO_EZE_NORTH_KNOWLEDGE.length).toBeGreaterThanOrEqual(6);
    const topics = IGBO_EZE_NORTH_KNOWLEDGE.map((k) => k.topic);
    expect(topics).toContain("geography");
    expect(topics).toContain("governance");
    expect(topics).toContain("culture");
    expect(topics).toContain("markets");
    expect(topics).toContain("language");
    expect(topics).toContain("platform");
  });
});