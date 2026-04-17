import { z } from "zod";

export const PREFERENCES_MAX_LENGTH = 1500;

export const updatePreferencesSchema = z.object({
	preferences: z.string().max(PREFERENCES_MAX_LENGTH).nullable(),
});

export const CLAUDE_TOKEN_PREFIX = "sk-ant-oat01-";

export const claudeTokenSchema = z.object({
	token: z
		.string()
		.regex(
			/^sk-ant-oat01-[A-Za-z0-9_-]{20,400}$/,
			`Token must start with ${CLAUDE_TOKEN_PREFIX} and look complete`,
		),
});
