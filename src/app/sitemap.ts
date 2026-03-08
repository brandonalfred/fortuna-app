import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
	const now = new Date();

	return [
		{
			url: "https://fortunabets.ai",
			lastModified: now,
			changeFrequency: "weekly",
			priority: 1.0,
		},
		{
			url: "https://fortunabets.ai/auth/signup",
			lastModified: now,
			changeFrequency: "monthly",
			priority: 0.8,
		},
		{
			url: "https://fortunabets.ai/auth/signin",
			lastModified: now,
			changeFrequency: "monthly",
			priority: 0.5,
		},
	];
}
