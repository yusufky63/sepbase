import type { MetadataRoute } from "next";
import { projectConfig } from "@/config/project.config";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = projectConfig.siteUrl.replace(/\/$/, "");
  return [
    { url: baseUrl, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/market`, changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/developers`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/security`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/privacy`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
