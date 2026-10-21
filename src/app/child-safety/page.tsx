import type { Metadata } from "next";
import Link from "next/link";

import { SiteHeader } from "@/components/layout/site-header";

export const metadata: Metadata = {
  title: "Child safety standards",
  description:
    "How Ezike Oba prevents, detects and reports child sexual abuse and exploitation, and how to report a concern.",
  alternates: { canonical: "/child-safety" },
};

// The site header reads the session to choose between "Feed" and "Sign in".
export const dynamic = "force-dynamic";

/**
 * Google Play requires every app in the Social category to publish its
 * standards against child sexual abuse and exploitation (CSAE) at a public,
 * non-editable URL, and to name a contact who can speak to them. Without this
 * page the app cannot be sent for review at all.
 *
 * Everything claimed here is something the platform actually does. Where a
 * control does not exist yet it is described as what we will do on a report,
 * not as a system that is already running — an overstated safety claim is
 * worse than an honest gap, both for a reviewer and for a child.
 */
export default function ChildSafetyPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Child safety standards
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated 21 October 2026</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted-foreground [&_ul]:space-y-1.5 [&_ul]:text-muted-foreground [&_ol]:space-y-1.5 [&_ol]:text-muted-foreground">
          <section>
            <h2>Our position</h2>
            <p>
              Ezike Oba has <strong>zero tolerance</strong> for child sexual abuse and
              exploitation (CSAE). Child sexual abuse material (CSAM), sexualised depictions of
              minors, grooming, sextortion, and trafficking of children are forbidden on this
              platform, in posts, photographs, marketplace listings, group chats and private
              messages alike.
            </p>
            <p>
              Ezike Oba is built for the people of Igbo-Eze North Local Government Area, Enugu
              State, Nigeria. These standards apply to every member, wherever they are.
            </p>
          </section>

          <section>
            <h2>The platform is for adults</h2>
            <p>
              Ezike Oba is intended for people aged <strong>18 and over</strong>, and is declared
              as such on Google Play. Accounts we find to belong to children are removed.
            </p>
          </section>

          <section>
            <h2>How to report a child safety concern</h2>
            <p>
              <strong>In the app:</strong> every post, comment, marketplace listing and member
              profile carries a <strong>Report</strong> action. Choose{" "}
              <strong>&ldquo;Child safety (sexual abuse or exploitation of a minor)&rdquo;</strong>{" "}
              as the reason. Reports reach our moderators directly; the person reported is never
              told who reported them.
            </p>
            <p>
              <strong>By email:</strong> write to{" "}
              <a
                href="mailto:iheanachohubert@gmail.com"
                className="font-medium text-primary underline"
              >
                iheanachohubert@gmail.com
              </a>
              . This address is monitored by our designated child safety contact, who is able to
              answer questions about these standards and our CSAM prevention practices.
            </p>
            <p>
              You can also <strong>block</strong> any member from the app, which removes their
              posts and messages from your view immediately and does not notify them.
            </p>
            <p>
              <strong>If a child is in immediate danger, contact the police first.</strong> In
              Nigeria dial <strong>112</strong>, or the NAPTIP helpline on <strong>0703 000 0203</strong>.
              Reporting to us is not a substitute for contacting the authorities.
            </p>
          </section>

          <section>
            <h2>What we do when a report arrives</h2>
            <ol>
              <li>Reports naming child safety are treated as the highest priority.</li>
              <li>
                Moderators review the content. Anything that is or appears to be CSAE material is
                removed from public view.
              </li>
              <li>
                The account responsible is suspended, and removed permanently where the material
                is confirmed.
              </li>
              <li>
                We preserve the evidence and the account records rather than deleting them, so
                that investigators can use them.
              </li>
              <li>
                We report to the relevant authorities, including the Nigeria Police Force and
                NAPTIP, and to NCMEC where the material falls within its remit.
              </li>
            </ol>
            <p>
              Moderation decisions are written to an append-only audit trail that moderators
              cannot edit, so that any review of how a case was handled is possible after the
              fact.
            </p>
          </section>

          <section>
            <h2>Preventing abuse of the platform</h2>
            <ul>
              <li>Every member registers with a confirmed email address; there is no anonymous posting.</li>
              <li>Private messages are limited to members; there is no open messaging from strangers outside the platform.</li>
              <li>Reporting and blocking are available on every surface that carries member content.</li>
              <li>Sexual content of any kind is prohibited by our <Link href="/terms" className="font-medium text-primary underline">community guidelines</Link>, and sexual content involving minors results in permanent removal and a report to the authorities.</li>
              <li>
                We do not yet run automated CSAM hash-matching. Detection today depends on member
                reports and moderator review, which is why the reporting route above is
                prominent and why we answer it quickly.
              </li>
            </ul>
          </section>

          <section>
            <h2>Designated contact</h2>
            <p>
              Hubert Iheanacho &mdash;{" "}
              <a
                href="mailto:iheanachohubert@gmail.com"
                className="font-medium text-primary underline"
              >
                iheanachohubert@gmail.com
              </a>
              . Questions from Google, from law enforcement, or from any member about these
              standards reach this address.
            </p>
          </section>

          <section>
            <h2>Related</h2>
            <p>
              See our{" "}
              <Link href="/terms" className="font-medium text-primary underline">
                terms of use and community guidelines
              </Link>{" "}
              and our{" "}
              <Link href="/privacy" className="font-medium text-primary underline">
                privacy policy
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
