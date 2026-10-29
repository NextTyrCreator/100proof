import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl(),
      lastModified: new Date("2026-10-29"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl()}/information`,
      lastModified: new Date("2026-10-29"),
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];
}
