import { z } from "zod";

export const PREFERENCES_MAX_LENGTH = 1500;

export const updatePreferencesSchema = z.object({
	preferences: z.string().max(PREFERENCES_MAX_LENGTH).nullable(),
});

export const claudeTokenSchema = z.object({
	token: z
		.string()
		.regex(/^sk-ant-oat01-.+/, "Token must start with sk-ant-oat01-"),
});
