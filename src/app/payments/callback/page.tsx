import { Suspense } from "react";
import { PaymentCallbackContent } from "./callback-content";
import { Loader2 } from "lucide-react";

export const metadata = {
  title: "Payment Confirmation | Ezike Oba",
  description: "Verification and status confirmation for Ezike Oba transactions.",
};

export default function PaymentCallbackPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4 sm:p-6">
      <Suspense
        fallback={
          <div className="w-full max-w-md p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center shadow-xl">
            <Loader2 className="h-10 w-10 animate-spin text-emerald-600 mx-auto mb-4" />
            <h2 className="text-lg font-semibold">Verifying Transaction...</h2>
            <p className="text-xs text-zinc-500 mt-2">Connecting to Paystack secure network</p>
          </div>
        }
      >
        <PaymentCallbackContent />
      </Suspense>
    </div>
  );
}