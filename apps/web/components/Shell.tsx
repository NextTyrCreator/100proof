import { AudienceProvider, type Audience } from "./Audience";
import { Footer } from "./Footer";
import { HeaderBar } from "./HeaderBar";
import { InventoryProvider } from "./InventoryProvider";
import { PageFade } from "./PageFade";

export function Shell({
  children,
  signedIn,
  email,
  audience,
}: {
  children: React.ReactNode;
  signedIn: boolean;
  email: string | null;
  audience: Audience | null;
}) {
  return (
    <InventoryProvider>
      <AudienceProvider initial={audience}>
        <div className="shell">
          <HeaderBar signedIn={signedIn} email={email} />
          <main className="main">
            <PageFade>{children}</PageFade>
          </main>
          <Footer />
        </div>
      </AudienceProvider>
    </InventoryProvider>
  );
}
