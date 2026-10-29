import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/site";

const PRIVATE = ["/auth/", "/api/", "/scan", "/inventory"];

/** Search and live-retrieval bots that answer questions with citations. Named so the intent is plain. */
const ANSWER_BOTS = [
  "Googlebot",
  "Bingbot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "Claude-SearchBot",
  "Claude-User",
  "Applebot",
  "DuckDuckBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: ANSWER_BOTS, allow: ["/", "/information", "/llms.txt"], disallow: PRIVATE },
      { userAgent: "*", allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
