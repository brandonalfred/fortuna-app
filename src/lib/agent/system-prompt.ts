import fs from "node:fs";
import path from "node:path";

const DEFAULT_TIMEZONE = "America/New_York";

export const AGENT_MODEL = "claude-opus-4-6";

export const AGENT_ALLOWED_TOOLS = [
	"Read",
	"Write",
	"Edit",
	"Glob",
	"Grep",
	"Bash",
	"WebSearch",
	"WebFetch",
	"Skill",
	"Task",
];

function formatCurrentDate(timezone: string): string {
	const now = new Date();
	const dateFormatter = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZoneName: "shortGeneric",
	});
	const ianaLabel = `(${timezone})`;
	return `${dateFormatter.format(now)} ${ianaLabel}`;
}

export function collectEnvVars(keys: string[]): Record<string, string> {
	return Object.fromEntries(
		keys
			.map((key) => [key, process.env[key]] as const)
			.filter((entry): entry is [string, string] => !!entry[1]),
	);
}

function sanitizeName(name: string): string {
	return name
		.replace(/[^\p{L}\p{N}\s'-]/gu, "")
		.trim()
		.slice(0, 50);
}

export function getSystemPrompt(
	timezone?: string,
	userFirstName?: string,
	userPreferences?: string,
): string {
	const promptPath = path.join(process.cwd(), "src/lib/agent/system-prompt.md");
	const basePrompt = fs.readFileSync(promptPath, "utf-8");

	const currentDate = formatCurrentDate(timezone || DEFAULT_TIMEZONE);
	const dateContext = `\n\nIMPORTANT: The current date and time is ${currentDate}.
- Use this as the reference for "today", "tonight", "yesterday", "tomorrow", etc.
- Be aware of whether games have already started or ended based on this time.
- Derive the current sports season from this date (e.g., NBA 2025-26 regular season).
`;

	const safeName = userFirstName ? sanitizeName(userFirstName) : "";
	const userContext = safeName
		? `\n\nThe user's name is ${safeName}. Use their name naturally and sparingly — in greetings and occasionally when it feels conversational. Don't use it in every message.\n`
		: "";

	const preferencesContext = userPreferences
		? `\n\nUSER PREFERENCES:\nThe user has set the following personal preferences. Respect these throughout every interaction:\n${userPreferences}\n`
		: "";

	return basePrompt + dateContext + userContext + preferencesContext;
}

export interface SkillFile {
	name: string;
	content: string;
}

export function getSkillFiles(): SkillFile[] {
	const skillsDir = path.join(process.cwd(), ".claude/skills");
	if (!fs.existsSync(skillsDir)) return [];

	const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
	const skills: SkillFile[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
		if (!fs.existsSync(skillPath)) continue;
		skills.push({
			name: entry.name,
			content: fs.readFileSync(skillPath, "utf-8"),
		});
	}

	return skills;
}
