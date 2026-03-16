import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	outputFileTracingIncludes: {
		"/api/chat": [
			"./src/lib/agent/sandbox-sse-server.mjs",
			"./src/lib/agent/sdk-event-translator.mjs",
		],
		"/api/chats/generate-title": [
			"./node_modules/@anthropic-ai/claude-agent-sdk/cli.js",
		],
	},
};

export default nextConfig;
