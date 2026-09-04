"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
import { createProjectSchema, donateProjectSchema } from "./schemas";
import { generatePaymentReference, initializePaystackTransaction } from "@/features/payments/paystack";
import { nairaToKobo } from "@/features/payments/schemas";

export async function createProjectAction(prevState: unknown, formData: FormData) {
  try {
    const user = await requireUser();
    const rawData = {
      title: formData.get("title")?.toString() || "",
      description: formData.get("description")?.toString() || "",
      category: formData.get("category")?.toString() || "road",
      target_village_id: formData.get("target_village_id")?.toString() || "",
      target_amount_naira: Number(formData.get("target_amount_naira")) || 0,
      image_url: formData.get("image_url")?.toString() || "",
    };

    const parsed = createProjectSchema.safeParse(rawData);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || "Invalid project details" };
    }

    const { title, description, category, target_village_id, target_amount_naira, image_url } = parsed.data;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("community_projects")
      .insert({
        creator_id: user.id,
        title,
        description,
        category,
        target_village_id: target_village_id || null,
        target_amount_naira,
        raised_amount_naira: 0,
        donors_count: 0,
        status: "pending_review",
        image_url: image_url || null,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to submit project proposal" };
    }

    revalidatePath("/projects");
    return {
      success: true,
      message: "Community project submitted for administrative review!",
      projectId: data.id,
    };
  } catch (err: unknown) {
    console.error("createProjectAction error:", err);
    return { success: false, error: (err instanceof Error ? err.message : null) || "Failed to create project" };
  }
}

export async function donateToProjectAction(
  projectId: string,
  amountNaira: number,
  donorName?: string
) {
  try {
    const parsed = donateProjectSchema.safeParse({
      project_id: projectId,
      amount_naira: amountNaira,
      donor_name: donorName,
    });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || "Invalid contribution details" };
    }

    const supabase = await createClient();
    let userId: string | null = null;
    let userEmail = "donor@ezikeoba.org";

    try {
      const user = await requireUser();
      userId = user.id;
      userEmail = user.email || userEmail;
    } catch {
      // Allow guest/diaspora donations with fallback user
    }

    const { data: project } = await supabase
      .from("community_projects")
      .select("id, title")
      .eq("id", projectId)
      .single();

    const projectTitle = project?.title || "Community Project";
    const amountKobo = nairaToKobo(amountNaira);
    const reference = generatePaymentReference("EZK_DON");

    if (userId) {
      await supabase.from("payments").insert({
        user_id: userId,
        reference,
        amount_kobo: amountKobo,
        currency: "NGN",
        status: "pending",
        purpose: "donation",
        target_id: projectId,
        metadata: {
          project_title: projectTitle,
          donor_name: donorName || "Anonymous Donor",
          amount_naira: amountNaira,
        },
      });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const callbackUrl = `${siteUrl}/payments/callback`;

    const paystackRes = await initializePaystackTransaction({
      email: userEmail,
      amountKobo,
      reference,
      callbackUrl,
      metadata: {
        project_id: projectId,
        purpose: "donation",
        amount_naira: amountNaira,
      },
    });

    return {
      success: true,
      authorization_url: paystackRes.authorization_url,
      reference,
      is_mock: paystackRes.is_mock,
    };
  } catch (err: unknown) {
    console.error("donateToProjectAction error:", err);
    return { success: false, error: (err instanceof Error ? err.message : null) || "Failed to initialize contribution checkout" };
  }
}