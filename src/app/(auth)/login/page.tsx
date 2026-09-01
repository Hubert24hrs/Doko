import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { LoginForm } from "@/features/auth/components/login-form";
import { OAuthButtons, AuthDivider } from "@/features/auth/components/oauth-buttons";
import { PasskeySignIn } from "@/features/auth/components/passkey-sign-in";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Ezike Oba.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main id="main" className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 inline-flex rounded-lg">
          <Logo />
        </Link>

        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Welcome back
        </h1>
        <p className="mb-6 mt-1 text-sm text-muted-foreground">
          Sign in to continue to your community.
        </p>

        <PasskeySignIn next="/home" className="mb-2.5" />
        <OAuthButtons next="/home" />
        <AuthDivider label="or sign in with email" />
        <LoginForm />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          New to Ezike Oba?{" "}
          <Link
            href="/register"
            className="font-medium text-primary hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
