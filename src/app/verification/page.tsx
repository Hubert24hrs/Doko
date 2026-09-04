import type { Metadata } from "next";
import Link from "next/link";
import {
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Crown,
  Users,
} from "lucide-react";

import { getSessionUser } from "@/features/auth/session";
import { getMyVerificationStatus } from "@/features/verification/queries";
import { VerificationApplicationForm } from "@/features/verification/components/verification-application-form";
import { cancelVerificationRequestAction } from "@/features/verification/actions";
import { VerifiedBadge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Verification Center — Ezike Oba",
  description:
    "Official Golden and Blue verification tiers for Igbo-Eze North citizens, office holders, and community leaders.",
};

export default async function VerificationPage() {
  const [sessionUser, status] = await Promise.all([
    getSessionUser(),
    getMyVerificationStatus(),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Back Link */}
      <div className="mb-6">
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to Dashboard</span>
        </Link>
      </div>

      {/* Header */}
      <div className="border-b border-border pb-8 mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500/20 via-primary/20 to-sky-500/20 text-primary ring-1 ring-border">
            <ShieldCheck className="size-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Community Verification
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Official identity verification and trust credentials for Igbo Eze North LGA.
            </p>
          </div>
        </div>
      </div>

      {/* User Status Card */}
      <div className="mt-8">
        {sessionUser ? (
          status?.isVerified ? (
            <Card className="border-eo-gold-500/30 bg-gradient-to-br from-eo-gold-100/40 via-surface to-surface-sunken p-6 dark:from-eo-gold-950/20">
              <div className="flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30">
                  <CheckCircle2 className="size-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-foreground">
                      Your Profile is Verified
                    </h2>
                    <VerifiedBadge
                      type={status.verificationType}
                      ticker
                      label={status.verificationType === "gold" ? "Golden Verified" : "Blue Verified"}
                    />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                    You hold official{" "}
                    <strong>{status.verificationType === "gold" ? "Golden Tier" : "Blue Tier"}</strong>{" "}
                    status in the Ezike Oba network. Your ticker badge is displayed across all your posts, comments, and profile listings.
                  </p>
                  {status.verifiedAt && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Verified on: {new Date(status.verifiedAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ) : status?.pendingRequest ? (
            <Card className="border-sky-500/30 bg-sky-50/40 p-6 dark:bg-sky-950/20">
              <div className="flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/30">
                  <Clock className="size-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-foreground">
                      Verification Request Under Review
                    </h2>
                    <VerifiedBadge
                      type={status.pendingRequest.tier}
                      ticker
                      label={status.pendingRequest.tier === "gold" ? "Golden Request" : "Blue Request"}
                    />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                    Your application for{" "}
                    <strong className={status.pendingRequest.tier === "gold" ? "text-amber-600 dark:text-amber-400" : "text-sky-600 dark:text-sky-400"}>
                      {status.pendingRequest.tier === "gold" ? "Golden Verification" : "Blue Verification"}
                    </strong>{" "}
                    has been submitted to the administration. We will review your details and update your account.
                  </p>
                  <div className="mt-4 flex items-center gap-4">
                    <form action={async (formData) => {
                      "use server";
                      await cancelVerificationRequestAction({ ok: false }, formData);
                    }}>
                      <input type="hidden" name="requestId" value={status.pendingRequest.id} />
                      <button
                        type="submit"
                        className="text-xs text-danger hover:underline"
                      >
                        Cancel Request
                      </button>
                    </form>
                    <span className="text-xs text-muted-foreground">
                      Submitted on {new Date(status.pendingRequest.created_at).toLocaleDateString("en-GB")}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-6">
              <div className="mb-6">
                <h2 className="text-lg font-bold text-foreground">
                  Apply for Community Verification
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Complete the preliminary application below. Requirements and document verification guidelines will be published shortly.
                </p>
              </div>
              <VerificationApplicationForm />
            </Card>
          )
        ) : (
          <Card className="p-8 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="size-7" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-foreground">
              Sign in to Get Verified
            </h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
              Verification provides authentic representation for citizens and leaders across the 33+ communities of Igbo-Eze North.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link href="/login?next=/verification" className={buttonVariants({ variant: "primary" })}>
                Sign In to Apply
              </Link>
              <Link href="/register" className={buttonVariants({ variant: "outline" })}>
                Create Account
              </Link>
            </div>
          </Card>
        )}
      </div>

      {/* Two Tiers Comparison Section */}
      <div className="mt-12">
        <h2 className="text-xl font-bold text-foreground">
          Understanding the Verification Tiers
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Igbo Eze North operates a two-tier verification standard ensuring clarity, accountability, and recognition.
        </p>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {/* Golden Tier Card */}
          <div className="relative overflow-hidden rounded-xl border border-amber-400/40 bg-gradient-to-b from-amber-500/10 via-surface to-surface p-6 shadow-xs dark:from-amber-950/20">
            <div className="flex items-center justify-between">
              <div className="flex size-10 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30">
                <Crown className="size-5" />
              </div>
              <VerifiedBadge type="gold" ticker label="Official Ticker" />
            </div>

            <h3 className="mt-4 text-base font-bold text-foreground">
              Golden Verification
            </h3>
            <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
              For Office Holders & Prominent Citizens
            </p>

            <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <Sparkles className="size-3.5 shrink-0 text-amber-500 mt-0.5" />
                <span>Eze / Igwe royal cabinets, traditional elders, and village heads</span>
              </li>
              <li className="flex items-start gap-2">
                <Sparkles className="size-3.5 shrink-0 text-amber-500 mt-0.5" />
                <span>Elected councilors, LGA chairmen, and public office holders</span>
              </li>
              <li className="flex items-start gap-2">
                <Sparkles className="size-3.5 shrink-0 text-amber-500 mt-0.5" />
                <span>Town union executives and diaspora development patrons</span>
              </li>
              <li className="flex items-start gap-2">
                <Sparkles className="size-3.5 shrink-0 text-amber-500 mt-0.5" />
                <span>Displays the golden ticker with verification mark on all community touchpoints</span>
              </li>
            </ul>
          </div>

          {/* Blue Tier Card */}
          <div className="relative overflow-hidden rounded-xl border border-sky-400/40 bg-gradient-to-b from-sky-500/10 via-surface to-surface p-6 shadow-xs dark:from-sky-950/20">
            <div className="flex items-center justify-between">
              <div className="flex size-10 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/30">
                <Users className="size-5" />
              </div>
              <VerifiedBadge type="blue" ticker label="Verified Ticker" />
            </div>

            <h3 className="mt-4 text-base font-bold text-foreground">
              Blue Verification
            </h3>
            <p className="mt-1 text-xs font-medium text-sky-600 dark:text-sky-400">
              For Active Community Members & Citizens
            </p>

            <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <ShieldCheck className="size-3.5 shrink-0 text-sky-500 mt-0.5" />
                <span>All registered residents and indigenes of Igbo Eze North</span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="size-3.5 shrink-0 text-sky-500 mt-0.5" />
                <span>Local business owners, traders in Ogrute / Eke Ozzi, and artisans</span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="size-3.5 shrink-0 text-sky-500 mt-0.5" />
                <span>Youth leaders, students, and community participants</span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="size-3.5 shrink-0 text-sky-500 mt-0.5" />
                <span>Displays the blue ticker with verification mark verifying genuine membership</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
