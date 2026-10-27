import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Shell } from "../components/Shell";
import type { Audience } from "../components/Audience";
import { siteUrl } from "../lib/site";
import { createServerSupabase } from "../lib/supabase/server";
import "./globals.css";

const title = "Verifiable personal property inventory in 100 seconds";
const description =
  "Most people are underinsured. Create a verifiable personal property inventory in 100 seconds for homeowners, renters, and commercial property. The walkthrough stays with the account.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: `100proof | ${title}`, template: "%s · 100proof" },
  description,
  keywords: [
    "personal property",
    "personal property insurance",
    "home inventory",
    "renters insurance",
    "homeowners insurance",
    "commercial property",
    "insuring property",
    "contents coverage",
    "verifiable inventory",
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

function readAudience(value: string | undefined): Audience | null {
  if (value === "insured" || value === "provider") return value;
  return null;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const cookieStore = await cookies();
  const audience = readAudience(cookieStore.get("100proof_audience")?.value);

  return (
    <html lang="en">
      <body>
        <Shell signedIn={Boolean(data.user)} email={data.user?.email ?? null} audience={audience}>
          {children}
        </Shell>
      </body>
    </html>
  );
}
