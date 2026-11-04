"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useAudience } from "./Audience";
import { AudienceTabs } from "./AudienceTabs";
import { Logo } from "./Logo";
import { Nav } from "./Nav";
import { SignOut } from "./SignOut";

export function HeaderBar({ signedIn, email }: { signedIn: boolean; email: string | null }) {
  const { audience } = useAudience();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [barHeight, setBarHeight] = useState(0);
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    setOpen(false);
  }, [path, audience]);

  useEffect(() => {
    const bar = headerRef.current;
    if (!bar) return;
    const measure = () => setBarHeight(bar.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth > 720) setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  function closeFromChoice(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (target instanceof Element && target.closest("a, button")) setOpen(false);
  }

  return (
    <header className="header" ref={headerRef}>
      <Logo />
      <div className="header-desktop">
        {signedIn ? <Nav /> : <AudienceTabs />}
        {signedIn ? (
          <div className="account">
            {email ? (
              <p className="account-email">
                <span className="account-email-label">Logged in as:</span>
                <span>{email}</span>
              </p>
            ) : null}
            <SignOut />
          </div>
        ) : null}
      </div>
      <button
        ref={toggleRef}
        type="button"
        className="menu-toggle"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        <MenuIcon open={open} />
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
      </button>
      {open
        ? createPortal(
            <div className="menu-layer" style={{ top: barHeight }}>
              <div className="menu-backdrop" onClick={() => setOpen(false)} />
              <div className="menu-sheet" id={menuId} role="dialog" aria-label="Menu" onClick={closeFromChoice}>
                {signedIn ? <Nav /> : <AudienceTabs />}
                {signedIn ? (
                  <div className="menu-account">
                    {email ? (
                      <p className="menu-account-who">
                        <span className="menu-account-label">Logged in as:</span>
                        <span className="menu-account-email">{email}</span>
                      </p>
                    ) : null}
                    <SignOut className="menu-logout" />
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </header>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg className="menu-icon" viewBox="0 0 22 22" aria-hidden="true">
      {open ? (
        <path d="M5 5 L17 17 M17 5 L5 17" />
      ) : (
        <path d="M3 6.5 H19 M3 11 H19 M3 15.5 H19" />
      )}
    </svg>
  );
}
