import { AudienceProvider, type Audience } from "./Audience";
import { AudienceTabs } from "./AudienceTabs";
import { Footer } from "./Footer";
import { InventoryProvider } from "./InventoryProvider";
import { Logo } from "./Logo";
import { Nav } from "./Nav";
import { PageFade } from "./PageFade";
import { SignOut } from "./SignOut";

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
          <header className="header">
            <Logo />
            {signedIn ? <Nav /> : <AudienceTabs />}
            {signedIn ? (
              <div className="account">
                {email ? <p className="account-email">{email}</p> : null}
                <SignOut />
              </div>
            ) : null}
            <span className="demo-chip">Demo</span>
          </header>
          <main className="main">
            <PageFade>{children}</PageFade>
          </main>
          <Footer />
        </div>
      </AudienceProvider>
    </InventoryProvider>
  );
}
