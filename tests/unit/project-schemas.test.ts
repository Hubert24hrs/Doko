import { describe, it, expect } from "vitest";
import { createProjectSchema, donateProjectSchema } from "@/features/projects/schemas";

describe("Community Projects & Diaspora Donation Schemas", () => {
  it("validates a complete project proposal", () => {
    const res = createProjectSchema.safeParse({
      title: "Amufie Solar Streetlights Project",
      description: "Installation of solar lights across Eke Amufie market square for night security.",
      category: "electricity_solar",
      target_amount_naira: 1500000,
      image_url: "https://images.unsplash.com/photo-1509391365360-2e959784a276",
    });

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.title).toBe("Amufie Solar Streetlights Project");
      expect(res.data.category).toBe("electricity_solar");
      expect(res.data.target_amount_naira).toBe(1500000);
    }
  });

  it("rejects project target amounts below ₦10,000", () => {
    const res = createProjectSchema.safeParse({
      title: "Valid Project Title",
      description: "Valid description longer than 10 characters",
      category: "road",
      target_amount_naira: 5000,
    });

    expect(res.success).toBe(false);
  });

  it("rejects invalid project categories", () => {
    const res = createProjectSchema.safeParse({
      title: "Valid Project Title",
      description: "Valid description longer than 10 characters",
      category: "unknown_category",
      target_amount_naira: 100000,
    });

    expect(res.success).toBe(false);
  });

  it("validates a donation payload with standard amount", () => {
    const res = donateProjectSchema.safeParse({
      project_id: "123e4567-e89b-12d3-a456-426614174000",
      amount_naira: 25000,
      donor_name: "Chief Emeka (Dallas, USA)",
    });

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.amount_naira).toBe(25000);
      expect(res.data.donor_name).toBe("Chief Emeka (Dallas, USA)");
    }
  });

  it("rejects donation amounts below ₦500", () => {
    const res = donateProjectSchema.safeParse({
      project_id: "123e4567-e89b-12d3-a456-426614174000",
      amount_naira: 200,
    });

    expect(res.success).toBe(false);
  });

  it("rejects donation amounts exceeding ₦5,000,000 single transaction ceiling", () => {
    const res = donateProjectSchema.safeParse({
      project_id: "123e4567-e89b-12d3-a456-426614174000",
      amount_naira: 6000000,
    });

    expect(res.success).toBe(false);
  });
});