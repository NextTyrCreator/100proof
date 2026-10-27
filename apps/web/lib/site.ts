/** Public site. Local dev overrides this with NEXT_PUBLIC_ROOT_URL. */
export function siteUrl() {
  const raw = process.env.NEXT_PUBLIC_ROOT_URL ?? "https://100proof.tech";
  return raw.replace(/\/$/, "");
}
