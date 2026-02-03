import { z } from "zod";

export const sendMessageSchema = z.object({
	message: z.string().min(1).max(10000),
	chatId: z.string().uuid().nullish(),
	sessionId: z.string().nullish(),
});

export const createChatSchema = z.object({
	title: z.string().min(1).max(200).optional(),
});

export const updateChatSchema = z.object({
	title: z.string().min(1).max(200),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type CreateChatInput = z.infer<typeof createChatSchema>;
export type UpdateChatInput = z.infer<typeof updateChatSchema>;
