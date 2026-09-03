"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/features/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";

import {
  categoryHasCondition,
  createListingSchema,
  listingStatusSchema,
  removeListingSchema,
} from "./schemas";

export interface ListingState {
  ok: boolean;
  formError?: string;
  fieldErrors?: Record<string, string>;
  changedAt?: string;
  /** Set by createListingAction on success. See that action for why it does
   * not redirect the way events' and jobs' equivalents do. */
  listingId?: string;
}

function toFieldErrors(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}

/**
 * Post a listing.
 *
 * Returns the new listing's id rather than redirecting, unlike
 * createEventAction and createJobAction. Those have no photos to upload
 * afterwards, so they can send the member straight to the new page; this one
 * cannot navigate until the client has finished uploading against the
 * listing's id, which only this action's response can provide.
 *
 * Saved before its contact row, exactly as a job is: if the second write
 * fails the seller keeps the listing and can add contact details afterwards,
 * rather than losing the whole thing because a phone number did not save.
 * Here the contact row is doubly optional -- it may never be written at all,
 * because a seller may choose to rely entirely on "Message the seller".
 */
export async function createListingAction(
  _prev: ListingState,
  formData: FormData,
): Promise<ListingState> {
  const user = await requireUser("/marketplace");

  const parsed = createListingSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category") ?? "other",
    condition: formData.get("condition") ?? "",
    price: formData.get("price") ?? "",
    priceIsNegotiable: formData.get("priceIsNegotiable") ?? "",
    canDeliver: formData.get("canDeliver") ?? "",
    locationText: formData.get("locationText") ?? "",
    geoId: formData.get("geoId") ?? "",
    visibility: formData.get("visibility") ?? "public",
    contactName: formData.get("contactName") ?? "",
    contactPhone: formData.get("contactPhone") ?? "",
    contactEmail: formData.get("contactEmail") ?? "",
    externalUrl: formData.get("externalUrl") ?? "",
    instructions: formData.get("instructions") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const limit = await checkRateLimit({
    key: `listing-create:${user.id}`,
    limit: 20,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      formError: "You have posted several listings today. Please try again tomorrow.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketplace_listings")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      // Not every category has a condition -- a service or fresh produce is
      // not secretly "new" -- so an unstated one is NULL, not a guess.
      condition:
        parsed.data.condition !== "" && categoryHasCondition(parsed.data.category)
          ? parsed.data.condition
          : null,
      price: parsed.data.price,
      price_is_negotiable: parsed.data.priceIsNegotiable,
      can_deliver: parsed.data.canDeliver,
      location_text: parsed.data.locationText,
      geo_id: parsed.data.geoId,
      visibility: parsed.data.visibility,
      seller_id: user.id,
    })
    .select("id");

  if (error) {
    console.error("[marketplace.create] failed", error.message);
    return { ok: false, formError: "That listing could not be posted." };
  }
  if (!data || data.length === 0) {
    return { ok: false, formError: "That listing could not be posted." };
  }

  const listingId = data[0].id;

  // Only worth writing if the seller actually gave something. A row of five
  // nulls is not a contact method -- it is noise the query layer would have
  // to look through and find nothing in every time.
  const hasContact =
    parsed.data.contactName ||
    parsed.data.contactPhone ||
    parsed.data.contactEmail ||
    parsed.data.externalUrl ||
    parsed.data.instructions;

  if (hasContact) {
    const { error: contactError } = await supabase.from("listing_contacts").insert({
      listing_id: listingId,
      contact_name: parsed.data.contactName,
      contact_phone: parsed.data.contactPhone,
      contact_email: parsed.data.contactEmail,
      external_url: parsed.data.externalUrl,
      instructions: parsed.data.instructions,
    });
    if (contactError) {
      console.error("[marketplace.create] contact failed", contactError.message);
    }
  }

  revalidatePath("/marketplace");
  return { ok: true, listingId };
}

/** Available, reserved, or sold. The seller's call alone -- see listings_guard_content. */
export async function setListingStatusAction(
  _prev: ListingState,
  formData: FormData,
): Promise<ListingState> {
  await requireUser("/marketplace");

  const parsed = listingStatusSchema.safeParse({
    listingId: formData.get("listingId"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { ok: false, formError: "That change could not be made." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketplace_listings")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.listingId)
    .select("id");

  if (error) {
    console.error("[marketplace.status] failed", error.message);
    return { ok: false, formError: "That change could not be made." };
  }
  if (!data || data.length === 0) {
    return { ok: false, formError: "That change could not be made." };
  }

  revalidatePath(`/marketplace/${parsed.data.listingId}`);
  revalidatePath("/marketplace");
  return { ok: true, changedAt: new Date().toISOString() };
}

export async function removeListingAction(
  _prev: ListingState,
  formData: FormData,
): Promise<ListingState> {
  await requireUser("/marketplace");

  const parsed = removeListingSchema.safeParse({
    listingId: formData.get("listingId"),
  });
  if (!parsed.success) {
    return { ok: false, formError: "That listing could not be removed." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketplace_listings")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.listingId)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    console.error("[marketplace.remove] failed", error.message);
    return { ok: false, formError: "That listing could not be removed." };
  }
  if (!data || data.length === 0) {
    return { ok: false, formError: "That listing could not be removed." };
  }

  revalidatePath("/marketplace");
  redirect("/marketplace");
}
