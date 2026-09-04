import type { Metadata, Viewport } from "next";

import "./globals.css";
import { ObaAiWidget } from "@/components/ai/oba-ai-widget";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Ezike Oba — the digital home of Igbo Eze North",
    template: "%s · Ezike Oba",
  },
  description:
    "Ezike Oba connects the people, villages, businesses and opportunities of Igbo Eze North, Enugu State.",
  applicationName: "Ezike Oba",
  openGraph: {
    type: "website",
    siteName: "Ezike Oba",
    locale: "en_NG",
    title: "Ezike Oba — the digital home of Igbo Eze North",
    description:
      "Connecting citizens, villages, towns, businesses and opportunities across Igbo Eze North.",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Ezike Oba",
    description:
      "The digital home of Igbo Eze North, Enugu State — communities, events, jobs and marketplace.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1310" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-NG" className="h-full">
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only-focusable absolute left-4 top-4 z-50 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Skip to main content
        </a>
        {children}
        <ObaAiWidget />
      </body>
    </html>
  );
}