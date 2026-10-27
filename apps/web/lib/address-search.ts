import { z } from "zod";

const featureSchema = z.object({
  geometry: z.object({
    coordinates: z.array(z.number()).min(2),
  }),
  properties: z
    .object({
      name: z.string().optional(),
      housenumber: z.union([z.string(), z.number()]).optional(),
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postcode: z.union([z.string(), z.number()]).optional(),
      country: z.string().optional(),
    })
    .optional(),
});

const photonSchema = z.object({
  features: z.array(featureSchema).max(8),
});

export type AddressHit = {
  label: string;
  latitude: number;
  longitude: number;
};

function featureLabel(feature: z.infer<typeof featureSchema>) {
  const properties = feature.properties;
  const street = [properties?.housenumber, properties?.street].filter(Boolean).join(" ");
  const city = [properties?.city, properties?.state, properties?.postcode].filter(Boolean).join(" ");
  const parts = [street || properties?.name, city, properties?.country].filter(Boolean);
  return parts.join(", ");
}

/** Address text only. The device location is not sent. */
export async function searchAddresses(query: string, signal?: AbortSignal): Promise<AddressHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", trimmed);
  url.searchParams.set("limit", "5");
  const response = await fetch(url, { signal });
  if (!response.ok) return [];
  const parsed = photonSchema.safeParse(await response.json());
  if (!parsed.success) return [];
  return parsed.data.features.flatMap((feature) => {
    const label = featureLabel(feature);
    const longitude = feature.geometry.coordinates[0];
    const latitude = feature.geometry.coordinates[1];
    if (!label || latitude == null || longitude == null) return [];
    return [{ label, latitude, longitude }];
  });
}
