import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	outputFileTracingIncludes: {
		"/api/chat": [
			"./src/lib/agent/sandbox-sse-server.mjs",
			"./src/lib/agent/sdk-event-translator.mjs",
		],
	},
};

export default nextConfig;
