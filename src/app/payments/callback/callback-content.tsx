"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Loader2, ArrowRight, ShieldCheck } from "lucide-react";
import { verifyPaymentAction } from "@/features/payments/actions";

export function PaymentCallbackContent() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"success" | "failed" | "error">("loading" as any);
  const [details, setDetails] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) {
      setLoading(false);
      setStatus("error");
      setErrorMsg("No payment reference found in query string.");
      return;
    }

    let isMounted = true;
    async function verify() {
      try {
        const res = await verifyPaymentAction(reference!);
        if (!isMounted) return;
        if (res.success) {
          setStatus("success");
          setDetails(res);
        } else {
          setStatus("failed");
          setErrorMsg(res.error || "Payment verification failed.");
        }
      } catch (err: any) {
        if (!isMounted) return;
        setStatus("error");
        setErrorMsg(err.message || "An unexpected error occurred.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    verify();
    return () => {
      isMounted = false;
    };
  }, [reference]);

  if (loading) {
    return (
      <div className="w-full max-w-md p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center shadow-xl">
        <div className="h-14 w-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center mx-auto mb-4 border border-emerald-200 dark:border-emerald-800">
          <Loader2 className="h-7 w-7 animate-spin text-emerald-700 dark:text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold">Verifying Payment</h2>
        <p className="text-xs text-zinc-500 mt-2">
          Please wait while we confirm your transaction with Paystack...
        </p>
      </div>
    );
  }

  if (status === "success") {
    const amountNaira = details?.amountKobo ? (details.amountKobo / 100).toLocaleString() : null;

    return (
      <div className="w-full max-w-md p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-900/60 text-center shadow-2xl relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="h-16 w-16 rounded-3xl bg-emerald-100 dark:bg-emerald-950/80 flex items-center justify-center mx-auto mb-5 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 shadow-inner">
          <CheckCircle2 className="h-9 w-9" />
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 mb-3 border border-emerald-200 dark:border-emerald-800">
          <ShieldCheck className="h-3.5 w-3.5" />
          Verified Secure
        </span>

        <h2 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
          Payment Successful!
        </h2>
        {amountNaira && (
          <p className="text-3xl font-extrabold text-emerald-700 dark:text-emerald-400 my-3 font-mono">
            ₦{amountNaira}
          </p>
        )}
        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed mb-6">
          Your campaign budget has been funded and will be showcased to the Igbo Eze North community.
        </p>

        <div className="bg-zinc-50 dark:bg-zinc-950/60 p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-left text-xs mb-6 space-y-1.5 font-mono">
          <div className="flex justify-between text-zinc-500">
            <span>Reference:</span>
            <span className="text-zinc-800 dark:text-zinc-200 font-semibold">{reference}</span>
          </div>
          {details?.channel && (
            <div className="flex justify-between text-zinc-500">
              <span>Channel:</span>
              <span className="capitalize text-zinc-800 dark:text-zinc-200 font-semibold">
                {details.channel}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          <Link
            href="/feed"
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors shadow-md"
          >
            <span>Go to Community Feed</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/marketplace"
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold transition-colors"
          >
            <span>Explore Marketplace</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-900/60 text-center shadow-xl">
      <div className="h-16 w-16 rounded-3xl bg-red-100 dark:bg-red-950/80 flex items-center justify-center mx-auto mb-5 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-800">
        <AlertCircle className="h-9 w-9" />
      </div>

      <h2 className="text-2xl font-black text-zinc-900 dark:text-zinc-50 mb-2">
        Payment Not Verified
      </h2>
      <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed mb-6">
        {errorMsg || "We were unable to verify this transaction with the payment gateway."}
      </p>

      <div className="flex flex-col gap-2.5">
        <Link
          href="/home"
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold transition-colors"
        >
          <span>Return Home</span>
        </Link>
        <Link
          href="/feed"
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-semibold transition-colors"
        >
          <span>Community Feed</span>
        </Link>
      </div>
    </div>
  );
}