import type { MetadataRoute } from "next";
import { projectConfig } from "@/config/project.config";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = projectConfig.siteUrl.replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/me", "/api/", "/r/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
