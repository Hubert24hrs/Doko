import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";

import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Confirm your email",
  robots: { index: false, follow: false },
};

export default function CheckEmailPage() {
  return (
    <main id="main" className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <Link href="/" className="mb-8 inline-flex rounded-lg">
          <Logo />
        </Link>

        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-eo-green-50 text-primary">
          <MailCheck className="size-6" aria-hidden="true" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Check your email
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We have sent you a confirmation link. Open it to finish setting up
          your Ezike Oba account.
        </p>

        <p className="mt-6 text-sm text-muted-foreground">
          Wrong address?{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Start again
          </Link>
        </p>
      </div>
    </main>
  );
}
