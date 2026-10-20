import type { Metadata } from "next";
import Link from "next/link";

import { SiteHeader } from "@/components/layout/site-header";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What Ezike Oba collects, why, who can see it, and how to have it removed.",
  alternates: { canonical: "/privacy" },
};

// The site header reads the session to choose between "Feed" and "Sign in".
export const dynamic = "force-dynamic";

/**
 * Written from what the code and the database actually do, not from a
 * template: every promise here has a mechanism behind it (RLS policy, private
 * bucket, blanked body, no staff read policy). If a feature changes what is
 * collected or who can read it, this page changes in the same commit.
 *
 * Google requires a privacy policy link before an OAuth app can leave Testing,
 * and Nigeria's Data Protection Act 2023 expects one regardless.
 */
export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Privacy policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated 20 October 2026</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted-foreground [&_ul]:space-y-1.5 [&_ul]:text-muted-foreground">
          <section>
            <h2>Who we are</h2>
            <p>
              Ezike Oba is a community platform for the people of Igbo-Eze North Local Government
              Area, Enugu State, Nigeria. This page explains what we collect when you use it, why,
              who can see it, and how you can have it removed.
            </p>
          </section>

          <section>
            <h2>What we collect</h2>
            <ul>
              <li>
                <strong className="text-foreground">Your account:</strong> email address, a
                password (stored only as a one-way hash by our authentication provider) or, if you
                choose, your Google account&apos;s name, email and profile picture.
              </li>
              <li>
                <strong className="text-foreground">Your profile:</strong> the name, username,
                photo, biography, community and social links you choose to add. Your community is
                optional.
              </li>
              <li>
                <strong className="text-foreground">What you post:</strong> posts, comments,
                reactions, photos, events, job and marketplace listings, community issue reports
                and the locations you attach to them.
              </li>
              <li>
                <strong className="text-foreground">Messages:</strong> the direct and group
                messages you send.
              </li>
              <li>
                <strong className="text-foreground">Verification requests:</strong> the details you
                submit when applying for a verified badge.
              </li>
              <li>
                <strong className="text-foreground">Payments:</strong> if you pay for an advert or
                contribute to a community project, a record of the amount and its reference. Card
                and bank details are entered with Paystack and never reach us.
              </li>
            </ul>
            <p className="mt-3">
              We do not use advertising trackers, and we do not sell personal information to
              anybody.
            </p>
          </section>

          <section>
            <h2>Who can see it</h2>
            <ul>
              <li>
                Posts and profiles are seen by whoever their visibility setting allows: everyone,
                people in your community, or your followers. A private profile is not shown to
                anyone else.
              </li>
              <li>
                Posts in a private group are seen only by its members.
              </li>
              <li>
                <strong className="text-foreground">Private messages are read only by the people
                in the conversation.</strong> Platform staff have no access to them. When you
                withdraw a message, its words are erased from our database, not merely hidden.
              </li>
              <li>
                Phone numbers on job and marketplace listings are shown only to signed-in members,
                never to search engines or signed-out visitors.
              </li>
              <li>
                A job application is read only by the applicant and the employer.
              </li>
              <li>
                Community issue reports are public, because their purpose is to be seen by whoever
                can fix them.
              </li>
              <li>
                Photos are stored privately and served through short-lived links, only to people
                allowed to see the post they belong to.
              </li>
            </ul>
          </section>

          <section>
            <h2>Services that process data for us</h2>
            <ul>
              <li><strong className="text-foreground">Supabase</strong>: database, sign-in and file storage.</li>
              <li><strong className="text-foreground">Vercel</strong>: hosting the website.</li>
              <li><strong className="text-foreground">Google</strong>: only if you choose to sign in with Google.</li>
              <li><strong className="text-foreground">Paystack</strong>: only if you make a payment.</li>
              <li>
                <strong className="text-foreground">Google Gemini</strong>: questions you type to
                the Oba AI assistant may be sent to it to compose an answer. Do not put private
                information in those questions.
              </li>
            </ul>
          </section>

          <section>
            <h2>How long we keep it</h2>
            <p>
              We keep your account and content while your account exists. Removed posts and
              comments are kept, hidden, so that moderation decisions can be reviewed. Payment
              records are kept as long as the law requires for financial records.
            </p>
          </section>

          <section>
            <h2>Your rights</h2>
            <p>
              Under the Nigeria Data Protection Act 2023 you may ask to see the personal
              information we hold about you, have it corrected, or have it deleted. You can edit
              most of it yourself in{" "}
              <Link href="/settings" className="font-medium text-primary underline">
                settings
              </Link>
              . You can{" "}
              <Link href="/delete-account" className="font-medium text-primary underline">
                delete your account yourself
              </Link>{" "}
              from Settings in the Ezike Oba app — your personal details are erased and you can no
              longer sign in, while what you wrote stays under &ldquo;Former member&rdquo; so that
              conversations other people took part in do not fall apart around them. For anything
              else, message a platform administrator on Ezike Oba and we will respond within 30
              days.
            </p>
          </section>

          <section>
            <h2>Changes</h2>
            <p>
              If this policy changes in a way that affects you, we will say so on the site before
              the change takes effect. See also our{" "}
              <Link href="/terms" className="font-medium text-primary underline">
                terms of use
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
