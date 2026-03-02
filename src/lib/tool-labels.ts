const INTERNAL_TOOLS = new Set(["Task", "Agent"]);

export function isInternalTool(name: string): boolean {
	return INTERNAL_TOOLS.has(name);
}

const TOOL_LABEL_MAP: Record<string, string> = {
	Skill: "Analyzing",
	WebSearch: "Researching",
	WebFetch: "Reading source",
	Bash: "Running script",
	Read: "Reading file",
	Write: "Writing file",
	Edit: "Editing file",
	Glob: "Searching files",
	Grep: "Searching",
	TodoWrite: "Updating TODOs",
	TodoRead: "Checking TODOs",
};

export function getToolLabel(name: string): string {
	return TOOL_LABEL_MAP[name] ?? name;
}

export function formatToolLabel(name: string, summary: string | null): string {
	const label = getToolLabel(name);
	return summary ? `${label}: ${summary}` : label;
}

export function mapAgentStatus(
	status: string,
): "complete" | "failed" | "stopped" {
	if (status === "completed") return "complete";
	if (status === "failed") return "failed";
	return "stopped";
}

export function truncate(text: string, maxLength = 60): string {
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength - 3)}...`;
}

export function getToolSummary(name: string, input: unknown): string | null {
	if (!input || typeof input !== "object") return null;
	const obj = input as Record<string, unknown>;

	switch (name) {
		case "Skill": {
			const skill = obj.skill as string | undefined;
			if (skill?.includes("odds")) return "Checking odds data";
			if (skill?.includes("sport")) return "Pulling player & team stats";
			return "Running analysis";
		}
		case "WebSearch": {
			const query = obj.query as string | undefined;
			return query ? truncate(query) : null;
		}
		case "WebFetch": {
			const url = obj.url as string | undefined;
			if (!url) return null;
			try {
				return new URL(url).hostname;
			} catch {
				return null;
			}
		}
		case "Bash":
			return null;
		case "Read":
		case "Write":
		case "Edit": {
			const filePath = obj.file_path as string | undefined;
			if (!filePath) return null;
			return filePath.split("/").pop() ?? null;
		}
		case "Grep":
		case "Glob": {
			const pattern = obj.pattern as string | undefined;
			return pattern ?? null;
		}
		default:
			return null;
	}
}
