import type { Metadata } from "next";
import Link from "next/link";

import { SiteHeader } from "@/components/layout/site-header";

export const metadata: Metadata = {
  title: "Terms of use and community guidelines",
  description:
    "The rules for using Ezike Oba: real people, honest listings, and respect for one another.",
  alternates: { canonical: "/terms" },
};

// The site header reads the session to choose between "Feed" and "Sign in".
export const dynamic = "force-dynamic";

/**
 * Registration asks every member to accept "the Ezike Oba community
 * guidelines", which until this page existed were not written down anywhere.
 * These are they. Google also requires a terms link before an OAuth app can
 * leave Testing.
 */
export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Terms of use and community guidelines
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated 20 October 2026</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted-foreground [&_ul]:space-y-1.5 [&_ul]:text-muted-foreground">
          <section>
            <h2>About these terms</h2>
            <p>
              Ezike Oba is a community platform for Igbo-Eze North. By creating an account you
              agree to these terms and guidelines. If you do not agree, please do not use the
              platform.
            </p>
          </section>

          <section>
            <h2>Your account</h2>
            <ul>
              <li>An account represents one real person, and that person is you.</li>
              <li>Do not impersonate anybody, including traditional rulers, officials or businesses.</li>
              <li>Keep your sign-in details to yourself. You are responsible for what is done with your account.</li>
            </ul>
          </section>

          <section>
            <h2>Community guidelines</h2>
            <ul>
              <li>Treat people with respect. No harassment, threats, hate speech or incitement to violence.</li>
              <li>Do not post anything illegal, sexually explicit, or that exposes someone&apos;s private information.</li>
              <li>Be truthful. Do not spread information you know to be false, and do not report issues that are not real.</li>
              <li>Respect bereavement. Funerals and condolences are part of this community&apos;s life; treat them with care.</li>
              <li>No spam, scams, chain messages or misleading adverts.</li>
            </ul>
          </section>

          <section>
            <h2>Jobs, marketplace and payments</h2>
            <ul>
              <li>Listings must describe real jobs and real items honestly, with an honest price or pay.</li>
              <li>
                Arrangements between buyers and sellers, or employers and applicants, are between
                them. Ezike Oba does not hold money, guarantee items or employ anybody advertised
                here. Meet in public places and never pay in advance to somebody you cannot verify.
              </li>
              <li>
                Adverts are reviewed before they appear. Contributions to community projects go to
                the project as described on its page; payments are processed by Paystack.
              </li>
            </ul>
          </section>

          <section>
            <h2>Your content</h2>
            <p>
              You own what you post. By posting it you allow Ezike Oba to store it and show it to
              the people your visibility settings allow. Only post photos and words you have the
              right to share.
            </p>
          </section>

          <section>
            <h2>Moderation</h2>
            <p>
              Moderators may remove content or suspend accounts that break these guidelines.
              They can remove what you wrote but can never change its words. Private messages are
              not read by moderators.
            </p>
          </section>

          <section>
            <h2>Verified badges</h2>
            <p>
              Golden and Blue badges are granted after review. A badge confirms identity or role;
              it is not an endorsement of everything that person says. Badges can be withdrawn.
            </p>
          </section>

          <section>
            <h2>No warranty</h2>
            <p>
              Ezike Oba is provided as it is. We work to keep it available and accurate, but we
              cannot promise it will always be, and we are not liable for losses arising from
              dealings between members.
            </p>
          </section>

          <section>
            <h2>Changes and contact</h2>
            <p>
              We may update these terms and will say so on the site when we do. How we handle
              your information is described in our{" "}
              <Link href="/privacy" className="font-medium text-primary underline">
                privacy policy
              </Link>
              . Questions can be sent to a platform administrator through Ezike Oba.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
