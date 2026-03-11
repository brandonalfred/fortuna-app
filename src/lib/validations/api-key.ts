import { z } from "zod";

export const createApiKeySchema = z.object({
	name: z.string().min(1).max(100),
	expiresAt: z.coerce.date().optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
