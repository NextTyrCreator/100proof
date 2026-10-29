"use client";

import { useState } from "react";
import { z } from "zod";
import { createBrowserSupabase } from "../lib/supabase/browser";

const inquirySchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  market: z.enum(["personal", "commercial", "both"]),
  note: z.string().trim().max(1000),
});

const referenceSchema = z.string().uuid();

type Receipt = {
  reference: string;
  contactName: string;
  companyName: string;
  email: string;
};

const POINTS = [
  {
    title: "The evidence on every line",
    body: "The clip and second it was seen, what the policyholder said, any receipt, and the comparable used to price it.",
  },
  {
    title: "Open items first",
    body: "Anything the video could not confirm is listed at the top of the file, not guessed.",
  },
  {
    title: "Priced the way your desk prices",
    body: "Replacement cost in the property's zip, and actual cash value after depreciation.",
  },
  {
    title: "Fits your intake",
    body: "A CSV and a versioned JSON claim file. You keep every coverage and payment decision.",
  },
];

const MARKETS = [
  { value: "personal", label: "Personal" },
  { value: "commercial", label: "Commercial" },
  { value: "both", label: "Both" },
] as const;

export function InsurerInquiry() {
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const parsed = inquirySchema.safeParse({
      companyName: form.get("companyName"),
      contactName: form.get("contactName"),
      email: form.get("email"),
      market: form.get("market"),
      note: form.get("note") ?? "",
    });
    if (!parsed.success) {
      setError("Enter a work email, the company, and your name.");
      return;
    }
    setPending(true);
    const supabase = createBrowserSupabase();
    const { data, error: saveError } = await supabase.rpc("submit_insurer_inquiry", {
      company_name: parsed.data.companyName,
      contact_name: parsed.data.contactName,
      email: parsed.data.email,
      market: parsed.data.market,
      note: parsed.data.note,
    });
    setPending(false);
    const reference = referenceSchema.safeParse(data);
    if (saveError || !reference.success) {
      setError("That request did not save. Try again in a moment.");
      return;
    }
    setReceipt({
      reference: reference.data,
      contactName: parsed.data.contactName,
      companyName: parsed.data.companyName,
      email: parsed.data.email,
    });
  }

  async function copyReference() {
    if (!receipt) return;
    try {
      await navigator.clipboard.writeText(receipt.reference);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="provider">
      <p className="provider-for">For insurers, adjusters, TPAs, and agents</p>
      <h1 className="provider-title">Contents files that arrive ready to review.</h1>
      <p className="provider-lead">
        Policyholders film their home before a loss. You get a room-by-room inventory with the evidence behind every line
        and the open items listed first.
      </p>

      <ul className="provider-points">
        {POINTS.map((point) => (
          <li key={point.title}>
            <strong>{point.title}</strong>
            <span>{point.body}</span>
          </li>
        ))}
      </ul>

      <section className="provider-card" aria-labelledby="provider-request">
        {receipt ? (
          <div className="inquiry-done" role="status">
            <h2 id="provider-request">Request received</h2>
            <p className="inquiry-thanks">Thank you. We will reply to {receipt.email}.</p>
            <dl className="inquiry-receipt">
              <div>
                <dt>Reference</dt>
                <dd className="inquiry-id">{receipt.reference}</dd>
              </div>
              <div>
                <dt>Submitted by</dt>
                <dd>
                  <span className="inquiry-person">{receipt.contactName}</span>
                  <span>{receipt.companyName}</span>
                </dd>
              </div>
            </dl>
            <button className="button quiet" type="button" onClick={() => void copyReference()}>
              {copied ? "Reference copied" : "Copy reference"}
            </button>
          </div>
        ) : (
          <form className="provider-form" onSubmit={submit} noValidate>
            <h2 id="provider-request">Request a connection</h2>
            <label className="field">
              <span>Work email</span>
              <input
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@company.com"
                required
                maxLength={200}
              />
            </label>
            <label className="field">
              <span>Company</span>
              <input name="companyName" autoComplete="organization" placeholder="Carrier, TPA, or agency" required maxLength={120} />
            </label>
            <label className="field">
              <span>Your name</span>
              <input name="contactName" autoComplete="name" required maxLength={120} />
            </label>
            <fieldset className="provider-market">
              <legend>Lines of business</legend>
              <div className="provider-market-options">
                {MARKETS.map((market) => (
                  <label key={market.value}>
                    <input type="radio" name="market" value={market.value} defaultChecked={market.value === "both"} />
                    <span>{market.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <details className="provider-note">
              <summary>Add a note (optional)</summary>
              <textarea
                name="note"
                aria-label="Note"
                placeholder="Claims intake, underwriting at bind or renewal, a CSV or JSON feed…"
                maxLength={1000}
                rows={3}
              />
            </details>
            <button className="button login-send provider-send" type="submit" disabled={pending}>
              {pending ? "Sending" : "Request a connection"}
            </button>
            <p className="provider-fine">We reply by email.</p>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
          </form>
        )}
      </section>
    </div>
  );
}
