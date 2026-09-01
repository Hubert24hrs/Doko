import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { RegisterForm } from "@/features/auth/components/register-form";
import { OAuthButtons } from "@/features/auth/components/oauth-buttons";
import { getVillageOptions } from "@/features/geo/queries";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Join Ezike Oba, the digital home of Igbo-Eze North.",
};

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  // Returns [] if the directory cannot be loaded; the village field is
  // optional, so sign-up must not be blocked by it.
  const villages = await getVillageOptions();

  return (
    <main id="main" className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 inline-flex rounded-lg">
          <Logo />
        </Link>

        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Join Ezike Oba
        </h1>
        <p className="mb-6 mt-1 text-sm text-muted-foreground">
          One digital home for the people of Igbo-Eze North.
        </p>


        <OAuthButtons next="/welcome" dividerLabel="or sign up with email" />
        <RegisterForm villages={villages} />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
