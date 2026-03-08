import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
	return {
		rules: {
			userAgent: "*",
			allow: ["/", "/auth/signin", "/auth/signup"],
			disallow: ["/new", "/chat/", "/api/"],
		},
		sitemap: "https://fortunabets.ai/sitemap.xml",
	};
}
