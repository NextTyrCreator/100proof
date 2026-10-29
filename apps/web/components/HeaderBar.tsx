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
  const hasMenu = signedIn || audience !== null;

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
            {email ? <p className="account-email">{email}</p> : null}
            <SignOut />
          </div>
        ) : null}
      </div>
      {hasMenu ? (
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
      ) : null}
      {open && hasMenu
        ? createPortal(
            <div className="menu-sheet" id={menuId} style={{ top: barHeight }} onClick={closeFromChoice}>
              {signedIn && email ? <p className="menu-email">{email}</p> : null}
              {signedIn ? <Nav /> : <AudienceTabs />}
              <div className="menu-spacer" />
              {signedIn ? <SignOut className="button quiet menu-logout" /> : null}
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
