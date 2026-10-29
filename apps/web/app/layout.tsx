import type { Metadata, Viewport } from "next";
import { Shell } from "../components/Shell";
import { siteUrl } from "../lib/site";
import { createServerSupabase } from "../lib/supabase/server";
import "./globals.css";

const title = "Verified proof of personal property";
const description =
  "Most people are underinsured. Take a video. 100proof turns it into an automated inventory you can prove, for homeowners, renters, and commercial property. The video stays with the account.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: `100proof | ${title}`, template: "%s · 100proof" },
  description,
  keywords: [
    "home inventory app",
    "household inventory app",
    "home inventory for insurance",
    "home inventory app for insurance",
    "NAIC home inventory app",
    "home inventory checklist",
    "personal property insurance",
    "renters insurance",
    "homeowners insurance",
    "contents claim",
    "replacement cost",
    "actual cash value",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "100proof",
    title: `100proof | ${title}`,
    description,
  },
  twitter: { card: "summary", title: `100proof | ${title}`, description },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();

  return (
    <html lang="en">
      <body>
        <Shell signedIn={Boolean(data.user)} email={data.user?.email ?? null}>
          {children}
        </Shell>
      </body>
    </html>
  );
}
