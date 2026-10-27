"use client";

import { useState } from "react";
import { z } from "zod";
import type { EnteredItem } from "../lib/inventory";

const itemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  value: z.string().trim(),
});

const MAX_FILE_BYTES = 15 * 1024 * 1024;

function chosenFile(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) return null;
  return value;
}

export function ItemForm({ onAdd }: { onAdd: (item: EnteredItem) => void }) {
  const [error, setError] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const parsed = itemSchema.safeParse({
      name: data.get("name"),
      description: data.get("description"),
      value: data.get("value") ?? "",
    });
    if (!parsed.success) {
      setError("Add a name and a description.");
      return;
    }
    let value: number | null = null;
    if (parsed.data.value !== "") {
      const amount = Number(parsed.data.value);
      if (!Number.isFinite(amount) || amount < 0) {
        setError("Enter a price as a number, or leave it blank.");
        return;
      }
      value = amount;
    }
    const photo = chosenFile(data.get("photo"));
    const source = chosenFile(data.get("source"));
    if ((photo && photo.size > MAX_FILE_BYTES) || (source && source.size > MAX_FILE_BYTES)) {
      setError("Each file needs to be under 15 MB.");
      return;
    }
    if (photo && !photo.type.startsWith("image/")) {
      setError("The picture needs to be an image.");
      return;
    }
    onAdd({
      id: crypto.randomUUID(),
      name: parsed.data.name,
      description: parsed.data.description,
      value,
      photoUrl: photo ? URL.createObjectURL(photo) : null,
      sourceName: source ? source.name : null,
      sourceUrl: source ? URL.createObjectURL(source) : null,
      confidence: "entered",
    });
    form.reset();
  }

  return (
    <form className="sheet stack item-form" onSubmit={submit}>
      <p className="total-label">Add an item</p>
      <label className="field">
        <span>Name</span>
        <input name="name" required maxLength={120} />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea name="description" required maxLength={500} rows={3} />
      </label>
      <label className="field">
        <span>Price from a source</span>
        <input name="value" inputMode="decimal" placeholder="Leave blank if you do not have one" />
      </label>
      <label className="field">
        <span>Picture</span>
        <input name="photo" type="file" accept="image/*" />
      </label>
      <label className="field">
        <span>Receipt, quote, invoice, or email</span>
        <input name="source" type="file" />
      </label>
      <button className="button" type="submit">
        Save item
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
