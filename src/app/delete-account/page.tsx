import type { Metadata } from "next";
import Link from "next/link";

import { SiteHeader } from "@/components/layout/site-header";

export const metadata: Metadata = {
  title: "Delete your Ezike Oba account",
  description:
    "How to delete your Ezike Oba account, what is erased, and what stays so other people's conversations survive.",
  alternates: { canonical: "/delete-account" },
};

// The site header reads the session to choose between "Feed" and "Sign in".
export const dynamic = "force-dynamic";

/**
 * Google Play requires a publicly reachable page, linked from the Play listing,
 * telling members how to delete their account and exactly what that does. It
 * has to be readable by someone who has not installed the app and is not
 * signed in, which is why it lives here rather than behind the session.
 *
 * Written against what `ezo_delete_my_account()` actually does. If that
 * function changes what it erases or keeps, this page changes in the same
 * commit — a deletion page that overstates what it removes is worse than none.
 */
export default function DeleteAccountPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Delete your Ezike Oba account
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated 20 October 2026</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ol_li]:list-decimal [&_p]:text-muted-foreground [&_ul]:space-y-1.5 [&_ul]:text-muted-foreground [&_ol]:space-y-1.5 [&_ol]:text-muted-foreground">
          <section>
            <h2>In the Ezike Oba app</h2>
            <p>You can delete your own account at any time. Nobody needs to do it for you.</p>
            <ol>
              <li>Open the Ezike Oba app and sign in</li>
              <li>
                Go to <strong>Profile</strong>, then <strong>Settings</strong>
              </li>
              <li>
                Scroll to the bottom and choose <strong>Delete my account</strong>
              </li>
              <li>Confirm</li>
            </ol>
            <p>
              It takes effect immediately and cannot be undone. You will be signed out on every
              device at once, and you will not be able to sign in again.
            </p>
          </section>

          <section>
            <h2>If you cannot reach the app</h2>
            <p>
              Email us from the address on the account and we will delete it for you. We answer
              within 30 days, and normally much sooner.
            </p>
          </section>

          <section>
            <h2>What is erased</h2>
            <ul>
              <li>Your name and username</li>
              <li>Your email address and phone number</li>
              <li>Your profile photograph</li>
              <li>Your biography, occupation and website</li>
              <li>Your date of birth and gender</li>
              <li>The community, town or village you chose</li>
              <li>Your social links</li>
              <li>Who you follow, and who follows you</li>
              <li>Any role you held, such as moderator</li>
              <li>Every sign-in session and device token</li>
            </ul>
          </section>

          <section>
            <h2>What stays, and why you should know before you decide</h2>
            <p>
              Posts, comments and marketplace listings you wrote <strong>remain</strong> on Ezike
              Oba, shown as <strong>&ldquo;Former member&rdquo;</strong> rather than under your
              name. Nothing identifying you is left on them.
            </p>
            <p>
              This is deliberate. A conversation is made of several people talking to one another.
              Removing one person&rsquo;s words would take the replies written by everyone else
              with them, and would empty one half of every private conversation, leaving gaps in
              somebody else&rsquo;s inbox. The community&rsquo;s record of itself would acquire
              holes wherever a single person left.
            </p>
            <p>
              <strong>
                If you want particular posts gone, delete them before you delete your account.
              </strong>{" "}
              You can remove your own posts, comments and listings at any time while signed in.
            </p>
            <p>
              Moderation records keep a note that an account was deleted, without your name, so
              that decisions taken about reported content remain reviewable.
            </p>
          </section>

          <section>
            <h2>Can you come back?</h2>
            <p>
              Your email address is released when the account is deleted, so you can register
              again later if you choose. It will be a new account: nothing from the old one is
              restored, and what you wrote before stays attributed to a former member.
            </p>
          </section>

          <section>
            <h2>More detail</h2>
            <p>
              Our{" "}
              <Link href="/privacy" className="font-medium text-primary underline">
                privacy policy
              </Link>{" "}
              explains everything we collect and who can see it, and our{" "}
              <Link href="/terms" className="font-medium text-primary underline">
                terms of use
              </Link>{" "}
              cover the rest.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
