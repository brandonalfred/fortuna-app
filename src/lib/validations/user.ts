import { z } from "zod";

export const PREFERENCES_MAX_LENGTH = 1500;

export const updatePreferencesSchema = z.object({
	preferences: z.string().max(PREFERENCES_MAX_LENGTH).nullable(),
});
