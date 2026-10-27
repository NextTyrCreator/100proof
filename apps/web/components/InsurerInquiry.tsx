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
      setError("Enter the company, a name, a work email, and the market.");
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
    <section className="sheet insurer">
      <h2>Request a connection or more information</h2>
      {receipt ? (
        <div className="inquiry-done">
          <p className="inquiry-thanks">
            Thank you. Your request has been submitted, and we have received it in the queue. We will contact you if we
            have any questions.
          </p>
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
                <span>{receipt.email}</span>
              </dd>
            </div>
          </dl>
          <button className="button quiet" type="button" onClick={() => void copyReference()}>
            {copied ? "Reference copied" : "Copy reference"}
          </button>
        </div>
      ) : (
        <>
          <p className="total-note">Tell us the company and how to reach you. We will follow up.</p>
          <form className="stack" onSubmit={submit}>
          <label className="field">
            <span>Company</span>
            <input name="companyName" required maxLength={120} />
          </label>
          <label className="field">
            <span>Your name</span>
            <input name="contactName" required maxLength={120} />
          </label>
          <label className="field">
            <span>Work email</span>
            <input name="email" type="email" required maxLength={200} />
          </label>
          <label className="field">
            <span>Market</span>
            <select name="market" defaultValue="both">
              <option value="personal">Personal property</option>
              <option value="commercial">Commercial property</option>
              <option value="both">Both</option>
            </select>
          </label>
          <label className="field">
            <span>What you want connected</span>
            <textarea name="note" maxLength={1000} rows={3} />
          </label>
          <button className="button" type="submit" disabled={pending}>
            {pending ? "Sending" : "Request connect / learn more"}
          </button>
        </form>
        </>
      )}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
