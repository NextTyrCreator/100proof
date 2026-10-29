import { z } from "zod";

const suggestSchema = z.object({
  suggestions: z
    .array(
      z.object({
        text: z.string(),
        magicKey: z.string(),
        isCollection: z.boolean().optional(),
      }),
    )
    .max(20)
    .optional(),
});

const candidateSchema = z.object({
  candidates: z
    .array(
      z.object({
        address: z.string(),
        location: z.object({
          x: z.number(),
          y: z.number(),
        }),
      }),
    )
    .max(5),
});

export type AddressHit = {
  label: string;
  latitude: number | null;
  longitude: number | null;
  magicKey: string;
};

type AddressPointHit = {
  label: string;
  latitude: number;
  longitude: number;
};

/**
 * One entry is one place the address lookup will accept.
 * `countryCode` is the geocoder's country filter. Europe is many countries.
 * Add a country by adding one entry.
 */
type AddressRegion = {
  id: string;
  label: string;
  countryCode: string;
};

const EUROPE = [
  "FRA",
  "DEU",
  "ITA",
  "ESP",
  "NLD",
  "BEL",
  "PRT",
  "IRL",
  "AUT",
  "CHE",
  "SWE",
  "NOR",
  "DNK",
  "FIN",
  "POL",
  "CZE",
  "GRC",
  "HUN",
  "ROU",
  "BGR",
  "HRV",
  "SVN",
  "SVK",
  "EST",
  "LVA",
  "LTU",
  "LUX",
  "MLT",
  "CYP",
  "ISL",
].join(",");

export const ADDRESS_REGIONS = [
  { id: "us", label: "United States", countryCode: "USA" },
  { id: "ca", label: "Canada", countryCode: "CAN" },
  { id: "uk", label: "United Kingdom", countryCode: "GBR" },
  { id: "eu", label: "Europe", countryCode: EUROPE },
] as const satisfies readonly AddressRegion[];

export const ADDRESS_REGION_IDS = ADDRESS_REGIONS.map((region) => region.id) as [
  (typeof ADDRESS_REGIONS)[number]["id"],
  ...(typeof ADDRESS_REGIONS)[number]["id"][],
];

type AddressRegionId = (typeof ADDRESS_REGIONS)[number]["id"];

const SUGGEST_URL = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/suggest";
const CANDIDATE_URL = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates";

function addressRegionById(id: string): AddressRegion | null {
  return ADDRESS_REGIONS.find((region) => region.id === id) ?? null;
}

export function addressRegionLabel(id: string) {
  return addressRegionById(id)?.label ?? "";
}

function leadingNumber(query: string) {
  const match = /^\s*(\d+[a-zA-Z]?)\b/.exec(query);
  return match?.[1] ?? "";
}

function hasNumber(label: string, number: string) {
  return new RegExp(`(^|\\D)${number}(\\D|$)`, "i").test(label);
}

/** Address text and the chosen country only. The device location is not sent. */
export async function searchAddresses(query: string, regionId: string, signal?: AbortSignal): Promise<AddressHit[]> {
  const region = addressRegionById(regionId);
  const trimmed = query.trim();
  if (!region || trimmed.length < 3) return [];
  const url = new URL(SUGGEST_URL);
  url.searchParams.set("text", trimmed);
  url.searchParams.set("countryCode", region.countryCode);
  url.searchParams.set("maxSuggestions", "8");
  url.searchParams.set("f", "pjson");
  const response = await fetch(url, { signal });
  if (!response.ok) return [];
  const parsed = suggestSchema.safeParse(await response.json());
  if (!parsed.success) return [];
  const number = leadingNumber(trimmed);
  const hits = (parsed.data.suggestions ?? []).flatMap((suggestion) => {
    if (suggestion.isCollection || !suggestion.text || !suggestion.magicKey) return [];
    return [{ label: suggestion.text, latitude: null, longitude: null, magicKey: suggestion.magicKey }];
  });
  const numbered = number ? hits.filter((hit) => hasNumber(hit.label, number)) : [];
  return (numbered.length > 0 ? numbered : hits).slice(0, 5);
}

/** Turn a chosen suggestion into a map point. */
export async function resolveAddress(hit: AddressHit, signal?: AbortSignal): Promise<AddressPointHit | null> {
  if (hit.latitude != null && hit.longitude != null) {
    return { label: hit.label, latitude: hit.latitude, longitude: hit.longitude };
  }
  const url = new URL(CANDIDATE_URL);
  url.searchParams.set("SingleLine", hit.label);
  url.searchParams.set("magicKey", hit.magicKey);
  url.searchParams.set("maxLocations", "1");
  url.searchParams.set("f", "pjson");
  const response = await fetch(url, { signal });
  if (!response.ok) return null;
  const parsed = candidateSchema.safeParse(await response.json());
  const match = parsed.success ? parsed.data.candidates[0] : undefined;
  if (!match) return null;
  return {
    label: match.address,
    longitude: match.location.x,
    latitude: match.location.y,
  };
}
