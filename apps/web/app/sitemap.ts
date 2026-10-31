import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes: {
    path: string;
    changeFrequency: "monthly" | "weekly" | "yearly";
    priority: number;
  }[] = [
    { path: "", changeFrequency: "monthly", priority: 1 },
    { path: "/docs", changeFrequency: "weekly", priority: 0.9 },
    { path: "/verify", changeFrequency: "monthly", priority: 0.8 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
    { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  ];

  return routes.map((route) => ({
    url: `${siteUrl}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
