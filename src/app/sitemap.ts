import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
	return [
		{
			url: "https://fortunabets.ai",
			changeFrequency: "weekly",
			priority: 1.0,
		},
		{
			url: "https://fortunabets.ai/auth/signup",
			changeFrequency: "monthly",
			priority: 0.8,
		},
		{
			url: "https://fortunabets.ai/auth/signin",
			changeFrequency: "monthly",
			priority: 0.5,
		},
	];
}
