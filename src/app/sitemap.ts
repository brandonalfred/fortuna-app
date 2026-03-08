import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
	return [
		{
			url: "https://fortunabets.ai",
			changeFrequency: "weekly",
			priority: 1.0,
		},
	];
}
