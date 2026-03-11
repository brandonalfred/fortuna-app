import { z } from "zod";

export const createApiKeySchema = z.object({
	name: z.string().trim().min(1).max(100),
	expiresAt: z.coerce
		.date()
		.refine((d) => d > new Date(), {
			message: "expiresAt must be in the future",
		})
		.optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
